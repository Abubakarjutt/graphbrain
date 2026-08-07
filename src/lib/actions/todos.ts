'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
     .select('id, database_id, list_id, title, due_date, assignee_id, attached_page_id, created_at')
     .eq('database_id', databaseId)
     .order('created_at', { ascending: true })
  if (itemsError) throw new Error(itemsError.message)

  const pageIds = (items ?? []).map(i => i.attached_page_id).filter(Boolean) as string[]
  const pageTitles: Record<string, string> = {}
  if (pageIds.length > 0) {
    const { data: attachedPages } = await supabase.from('pages').select('id, title').in('id', pageIds)
    for (const p of attachedPages ?? []) pageTitles[p.id] = p.title
  }

  // Fetch workspace member IDs, then resolve emails via the admin client
  // (workspace_members.user_id references auth.users, not a public table,
  //  so the anon-key client cannot join it — we need the service role)
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)

  const memberIds = (members ?? []).map(m => m.user_id)
  const assigneeList: { id: string; email: string }[] = []

  if (memberIds.length > 0) {
    const admin = createAdminClient()
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const memberSet = new Set(memberIds)
    for (const u of authUsers) {
      if (memberSet.has(u.id) && u.email) {
        assigneeList.push({ id: u.id, email: u.email })
      }
    }
  }

  // Build a lookup for items that already have an assignee_id stored
  const assignees: Record<string, { id: string; email: string }> = {}
  for (const a of assigneeList) assignees[a.id] = a

  return {
    lists: (lists ?? []) as TodoList[],
    items: (items ?? []).map(i => ({
      ...i,
      attached_page_title: i.attached_page_id ? (pageTitles[i.attached_page_id] ?? 'Untitled') : null,
      assignee: i.assignee_id ? assignees[i.assignee_id] ?? null : null,
    })) as TodoItemWithPage[],
    assignees: assigneeList,
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
     .insert({ database_id: databaseId, list_id: listId, title, due_date: dueDate, assignee_id: null, attached_page_id: null })
     .select()
     .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create item')

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return { ...data, attached_page_title: null, assignee: null } as TodoItemWithPage
}

export async function updateTodoItem(
  itemId: string,
  databaseId: string,
  workspaceId: string,
  patch: { title?: string; due_date?: string | null; list_id?: string; assignee_id?: string | null }
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

// ─── Time tracking ────────────────────────────────────────────────────────────

export async function saveTimeEntry(
  itemId: string,
  itemTitle: string,
  databaseId: string,
  workspaceId: string,
  startedAt: number,
  stoppedAt: number,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('time_entries').insert({
    item_id: itemId,
    item_title: itemTitle,
    database_id: databaseId,
    workspace_id: workspaceId,
    user_id: user.id,
    started_at: new Date(startedAt).toISOString(),
    stopped_at: new Date(stoppedAt).toISOString(),
    duration_ms: stoppedAt - startedAt,
  })
}

export interface UserTimeReport {
  userId: string
  email: string
  totalMs: number
  tasks: { itemId: string; itemTitle: string; totalMs: number }[]
}

export async function getTimeReport(
  databaseId: string,
  workspaceId: string,
  date: string,
): Promise<UserTimeReport[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: entries } = await supabase
    .from('time_entries')
    .select('user_id, item_id, item_title, duration_ms')
    .eq('database_id', databaseId)
    .gte('started_at', `${date}T00:00:00.000Z`)
    .lt('started_at', `${date}T24:00:00.000Z`)

  if (!entries || entries.length === 0) return []

  const admin = createAdminClient()
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailById = new Map(authUsers.map(u => [u.id, u.email ?? u.id]))

  const byUser = new Map<string, { email: string; totalMs: number; tasks: Map<string, { title: string; totalMs: number }> }>()
  for (const e of entries) {
    if (!byUser.has(e.user_id)) {
      byUser.set(e.user_id, { email: emailById.get(e.user_id) ?? e.user_id, totalMs: 0, tasks: new Map() })
    }
    const u = byUser.get(e.user_id)!
    u.totalMs += e.duration_ms
    if (!u.tasks.has(e.item_id)) u.tasks.set(e.item_id, { title: e.item_title, totalMs: 0 })
    u.tasks.get(e.item_id)!.totalMs += e.duration_ms
  }

  return [...byUser.entries()]
    .map(([userId, u]) => ({
      userId,
      email: u.email,
      totalMs: u.totalMs,
      tasks: [...u.tasks.entries()]
        .map(([itemId, t]) => ({ itemId, itemTitle: t.title, totalMs: t.totalMs }))
        .sort((a, b) => b.totalMs - a.totalMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
}
