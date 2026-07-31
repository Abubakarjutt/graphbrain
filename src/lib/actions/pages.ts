'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { upsertNode, scheduleEmbed, upsertEdge, findNodeId, findPageNodeByTitle } from '@/lib/graph/graph'
import { pageToText, parseMentions } from '@/lib/graph/content'
import type { Page, TiptapDocument, TiptapNode, Block } from '@/lib/types/database'

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

  const page = data as Page
  after(async () => {
    const nodeId = await upsertNode(workspaceId, 'page', page.id)
    if (parentId) {
      const parentNodeId = await findNodeId('page', parentId)
      if (parentNodeId) await upsertEdge(workspaceId, parentNodeId, nodeId, 'parent_child')
    }
    await scheduleEmbed(nodeId, pageToText('Untitled', []))
  })

  revalidatePath(`/workspace/${workspaceId}`)
  return page
}

export async function updatePageTitle(pageId: string, workspaceId: string, title: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pages')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', pageId)
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)

  after(async () => {
    const client = await createClient()
    const { data: blockRows } = await client
      .from('blocks')
      .select('id, page_id, type, content, position, created_at')
      .eq('page_id', pageId)
      .order('position', { ascending: true })
    const nodeId = await upsertNode(workspaceId, 'page', pageId)
    await scheduleEmbed(nodeId, pageToText(title, (blockRows ?? []) as Block[]))
  })

  revalidatePath(`/workspace/${workspaceId}`)
}

export async function deletePage(pageId: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pages')
    .delete()
    .eq('id', pageId)
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/workspace/${workspaceId}`)
}

export async function saveBlocks(pageId: string, workspaceId: string, doc: TiptapDocument, pageTitle: string): Promise<void> {
  const supabase = await createClient()

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

  after(async () => {
    const nodeId = await upsertNode(workspaceId, 'page', pageId)
    const mentionedTitles = parseMentions(doc.content ?? [])
    for (const title of mentionedTitles) {
      const targetNodeId = await findPageNodeByTitle(workspaceId, title)
      if (targetNodeId) {
        await upsertEdge(workspaceId, nodeId, targetNodeId, 'mention')
        await upsertEdge(workspaceId, targetNodeId, nodeId, 'backlink')
      }
    }
    await scheduleEmbed(nodeId, pageToText(pageTitle, blocks as unknown as Block[]))
  })

  revalidatePath(`/workspace/${workspaceId}/page/${pageId}`)
}

export async function loadBlocks(pageId: string, workspaceId: string): Promise<TiptapDocument> {
  const supabase = await createClient()

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
