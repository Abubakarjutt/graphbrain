'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { upsertNode, scheduleEmbed } from '@/lib/graph/graph'
import { rowToText } from '@/lib/graph/content'
import type { Database, DatabaseField, DatabaseRow, DatabaseRowWithTitle, DatabaseWithRows } from '@/lib/types/database'

export async function createDatabase(workspaceId: string): Promise<{ database: Database; pageId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: page, error: pageError } = await supabase
    .from('pages')
    .insert({ workspace_id: workspaceId, title: 'Untitled Database', created_by: user.id })
    .select()
    .single()
  if (pageError || !page) throw new Error(pageError?.message ?? 'Failed to create page')

  const { data: database, error: dbError } = await supabase
    .from('databases')
    .insert({ page_id: page.id, schema: [] })
    .select()
    .single()
  if (dbError || !database) {
    const deleteResult = await supabase.from('pages').delete().eq('id', page.id)
    const msg = dbError?.message ?? 'Failed to create database'
    throw new Error(deleteResult.error ? `${msg} (rollback also failed: ${deleteResult.error.message})` : msg)
  }

  revalidatePath(`/workspace/${workspaceId}`)
  return { database: database as Database, pageId: page.id }
}

export async function getDatabase(databaseId: string, workspaceId: string): Promise<DatabaseWithRows> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: db, error: dbError } = await supabase
    .from('databases')
    .select('id, page_id, schema, created_at')
    .eq('id', databaseId)
    .single()
  if (dbError || !db) throw new Error('Database not found or access denied')

  const { data: containerPage } = await supabase
    .from('pages')
    .select('id, workspace_id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')

  const { data: rows, error: rowsError } = await supabase
    .from('database_rows')
    .select('id, database_id, page_id, fields, created_at')
    .eq('database_id', databaseId)
    .order('created_at', { ascending: true })
  if (rowsError) throw new Error(rowsError.message)

  const pageIds = ((rows ?? []) as DatabaseRow[]).map(r => r.page_id).filter(Boolean) as string[]
  const pageTitles: Record<string, string> = {}
  if (pageIds.length > 0) {
    const { data: rowPages } = await supabase
      .from('pages')
      .select('id, title')
      .in('id', pageIds)
    for (const p of rowPages ?? []) pageTitles[p.id] = p.title
  }

  return {
    id: db.id,
    page_id: db.page_id,
    schema: db.schema as DatabaseField[],
    created_at: db.created_at,
    rows: ((rows ?? []) as DatabaseRow[]).map(r => ({
      id: r.id,
      database_id: r.database_id,
      page_id: r.page_id,
      fields: r.fields as Record<string, unknown>,
      created_at: r.created_at,
      page_title: r.page_id ? (pageTitles[r.page_id] ?? 'Untitled') : null,
    })),
  }
}

export async function updateDatabaseSchema(
  databaseId: string,
  workspaceId: string,
  schema: DatabaseField[]
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

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

  const { error } = await supabase
    .from('databases')
    .update({ schema })
    .eq('id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function createRow(
  databaseId: string,
  workspaceId: string,
  initialFields?: Record<string, unknown>
): Promise<DatabaseRowWithTitle> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

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

  const { data: page, error: pageError } = await supabase
    .from('pages')
    .insert({ workspace_id: workspaceId, parent_id: db.page_id, title: 'Untitled', created_by: user.id })
    .select()
    .single()
  if (pageError || !page) throw new Error(pageError?.message ?? 'Failed to create row page')

  const { data: row, error: rowError } = await supabase
    .from('database_rows')
    .insert({ database_id: databaseId, page_id: page.id, fields: initialFields ?? {} })
    .select()
    .single()
  if (rowError || !row) {
    const deleteResult = await supabase.from('pages').delete().eq('id', page.id)
    const msg = rowError?.message ?? 'Failed to create row'
    throw new Error(deleteResult.error ? `${msg} (rollback also failed: ${deleteResult.error.message})` : msg)
  }

  after(async () => {
    const nodeId = await upsertNode(workspaceId, 'database_row', row.id)
    await scheduleEmbed(nodeId, rowToText(row.fields as Record<string, unknown>))
  })

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return {
    id: row.id,
    database_id: row.database_id,
    page_id: page.id,
    fields: row.fields as Record<string, unknown>,
    created_at: row.created_at,
    page_title: page.title ?? null,
  }
}

export async function updateRowFields(
  rowId: string,
  databaseId: string,
  workspaceId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

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

  const { error } = await supabase
    .from('database_rows')
    .update({ fields })
    .eq('id', rowId)
    .eq('database_id', databaseId)
  if (error) throw new Error(error.message)

  after(async () => {
    const nodeId = await upsertNode(workspaceId, 'database_row', rowId)
    await scheduleEmbed(nodeId, rowToText(fields))
  })

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function deleteRow(
  rowId: string,
  databaseId: string,
  workspaceId: string
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

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

  const { data: row } = await supabase
    .from('database_rows')
    .select('id, page_id')
    .eq('id', rowId)
    .eq('database_id', databaseId)
    .single()
  if (!row) throw new Error('Row not found')

  const { error } = await supabase
    .from('database_rows')
    .delete()
    .eq('id', rowId)
  if (error) throw new Error(error.message)

  if (row.page_id) {
    const { error: pageDeleteError } = await supabase.from('pages').delete().eq('id', row.page_id)
    if (pageDeleteError) throw new Error(`Row deleted but failed to delete linked page: ${pageDeleteError.message}`)
  }

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}
