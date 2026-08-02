'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TodoBoard, TodoItemWithPage, TodoList } from '@/lib/types/database'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function assertDatabaseAccess(
  supabase: SupabaseServerClient,
  databaseId: string,
  workspaceId: string
): Promise<void> {
  const { data: db } = await supabase
    .from('databases')
    .select('id, page_id')
    .eq('id', databaseId)
    .single()
  if (!db) throw new Error('Database not found or access denied')

  const { data: containerPage } = await supabase
    .from('pages')
    .select('id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')
}

// Neither the todo_items FK nor its RLS policy constrain a list to the same
// database as the item — both only require the list row to exist. Without
// this check, a crafted list_id could point an item at a list in a
// different database, silently dropping it off its own board.
async function assertListBelongsToDatabase(
  supabase: SupabaseServerClient,
  listId: string,
  databaseId: string
): Promise<void> {
  const { data: list } = await supabase
    .from('todo_lists')
    .select('id')
    .eq('id', listId)
    .eq('database_id', databaseId)
    .single()
  if (!list) throw new Error('List not found')
}

export async function getTodoBoard(databaseId: string, workspaceId: string): Promise<TodoBoard> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)

  const { data: lists, error: listsError } = await supabase
    .from('todo_lists')
    .select('id, database_id, name, position, created_at')
    .eq('database_id', databaseId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (listsError) throw new Error(listsError.message)

  const { data: items, error: itemsError } = await supabase
    .from('todo_items')
    .select('id, database_id, list_id, title, due_date, attached_page_id, created_at')
    .eq('database_id', databaseId)
    .order('created_at', { ascending: true })
  if (itemsError) throw new Error(itemsError.message)

  const pageIds = (items ?? []).map(i => i.attached_page_id).filter(Boolean) as string[]
  const pageTitles: Record<string, string> = {}
  if (pageIds.length > 0) {
    const { data: attachedPages } = await supabase.from('pages').select('id, title').in('id', pageIds)
    for (const p of attachedPages ?? []) pageTitles[p.id] = p.title
  }

  return {
    lists: (lists ?? []) as TodoList[],
    items: (items ?? []).map(i => ({
      ...i,
      attached_page_title: i.attached_page_id ? (pageTitles[i.attached_page_id] ?? 'Untitled') : null,
    })) as TodoItemWithPage[],
  }
}

export async function createTodoList(databaseId: string, workspaceId: string, name: string): Promise<TodoList> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)

  const { data: last } = await supabase
    .from('todo_lists')
    .select('position')
    .eq('database_id', databaseId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPosition = last && last.length > 0 ? last[0].position + 1 : 0

  const { data, error } = await supabase
    .from('todo_lists')
    .insert({ database_id: databaseId, name, position: nextPosition })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create list')

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return data as TodoList
}

export async function renameTodoList(
  listId: string,
  databaseId: string,
  workspaceId: string,
  name: string
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)

  const { error } = await supabase
    .from('todo_lists')
    .update({ name })
    .eq('id', listId)
    .eq('database_id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function reorderTodoList(
  listId: string,
  databaseId: string,
  workspaceId: string,
  direction: 'left' | 'right'
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)

  const { data: lists, error: listsError } = await supabase
    .from('todo_lists')
    .select('id, position')
    .eq('database_id', databaseId)
    .order('position', { ascending: true })
  if (listsError) throw new Error(listsError.message)

  const ordered = lists ?? []
  const idx = ordered.findIndex(l => l.id === listId)
  if (idx === -1) throw new Error('List not found')
  const swapIdx = direction === 'left' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= ordered.length) return

  const a = ordered[idx]
  const b = ordered[swapIdx]
  // Both positions are swapped inside a single function body (one implicit
  // transaction) so the pair can't be left sharing a duplicate position if
  // one write succeeds and the other doesn't.
  const { error } = await supabase.rpc('swap_todo_list_positions', {
    id_a: a.id,
    id_b: b.id,
    target_database_id: databaseId,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function deleteTodoList(listId: string, databaseId: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)

  const { error } = await supabase
    .from('todo_lists')
    .delete()
    .eq('id', listId)
    .eq('database_id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function createTodoItem(
  listId: string,
  databaseId: string,
  workspaceId: string,
  title: string,
  dueDate: string | null = null
): Promise<TodoItemWithPage> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)
  await assertListBelongsToDatabase(supabase, listId, databaseId)

  const { data, error } = await supabase
    .from('todo_items')
    .insert({ database_id: databaseId, list_id: listId, title, due_date: dueDate, attached_page_id: null })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create item')

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return { ...data, attached_page_title: null } as TodoItemWithPage
}

export async function updateTodoItem(
  itemId: string,
  databaseId: string,
  workspaceId: string,
  patch: { title?: string; due_date?: string | null; list_id?: string }
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)
  if (patch.list_id) await assertListBelongsToDatabase(supabase, patch.list_id, databaseId)

  const { error } = await supabase
    .from('todo_items')
    .update(patch)
    .eq('id', itemId)
    .eq('database_id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function attachPageToTodoItem(
  itemId: string,
  databaseId: string,
  workspaceId: string,
  pageId: string | null
): Promise<{ title: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)

  let title: string | null = null
  if (pageId) {
    const { data: page } = await supabase
      .from('pages')
      .select('id, title')
      .eq('id', pageId)
      .eq('workspace_id', workspaceId)
      .single()
    if (!page) throw new Error('Page not found or access denied')
    title = page.title
  }

  const { error } = await supabase
    .from('todo_items')
    .update({ attached_page_id: pageId })
    .eq('id', itemId)
    .eq('database_id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return { title }
}

export async function deleteTodoItem(itemId: string, databaseId: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertDatabaseAccess(supabase, databaseId, workspaceId)

  const { error } = await supabase
    .from('todo_items')
    .delete()
    .eq('id', itemId)
    .eq('database_id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}
