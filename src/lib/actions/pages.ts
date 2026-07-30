'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Page, TiptapDocument, TiptapNode } from '@/lib/types/database'

export async function getPages(workspaceId: string): Promise<Page[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createPage(workspaceId: string, parentId: string | null): Promise<Page> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data, error } = await supabase
    .from('pages')
    .insert({ workspace_id: workspaceId, parent_id: parentId, title: 'Untitled', created_by: user.id })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/workspace/${workspaceId}`)
  return data
}

export async function updatePageTitle(pageId: string, workspaceId: string, title: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pages')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', pageId)
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/workspace/${workspaceId}`)
}

export async function deletePage(pageId: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  // workspace_id guard ensures users can only delete pages they own.
  // Child pages become root pages (ON DELETE SET NULL on parent_id).
  // Child blocks are removed automatically (ON DELETE CASCADE on blocks.page_id).
  const { error } = await supabase
    .from('pages')
    .delete()
    .eq('id', pageId)
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/workspace/${workspaceId}`)
}

export async function saveBlocks(pageId: string, workspaceId: string, doc: TiptapDocument): Promise<void> {
  const supabase = await createClient()

  // Verify page belongs to the workspace before touching its blocks
  const { data: page } = await supabase
    .from('pages')
    .select('id')
    .eq('id', pageId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!page) throw new Error('Page not found or access denied')

  const { error: deleteError } = await supabase.from('blocks').delete().eq('page_id', pageId)
  if (deleteError) throw new Error(deleteError.message)

  const blocks = (doc.content ?? []).map((node: TiptapNode, index: number) => ({
    page_id: pageId,
    type: node.type,
    content: node,
    position: index,
  }))

  if (blocks.length > 0) {
    const { error } = await supabase.from('blocks').insert(blocks)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/workspace/${workspaceId}/page/${pageId}`)
}

export async function loadBlocks(pageId: string, workspaceId: string): Promise<TiptapDocument> {
  const supabase = await createClient()

  // Verify page belongs to the workspace (RLS also enforces this)
  const { data: page } = await supabase
    .from('pages')
    .select('id')
    .eq('id', pageId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!page) throw new Error('Page not found or access denied')

  const { data, error } = await supabase
    .from('blocks')
    .select('id, type, content, position')
    .eq('page_id', pageId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)

  return {
    type: 'doc',
    content: (data ?? []).map(b => b.content as TiptapNode),
  }
}
