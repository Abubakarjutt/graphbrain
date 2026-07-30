'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Database, DatabaseField, DatabaseRow, DatabaseWithRows } from '@/lib/types/database'

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
