'use server'

import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/graph/ollama'

export async function upsertNode(
  workspaceId: string,
  entityType: 'page' | 'file' | 'database_row',
  entityId: string
): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('nodes')
    .upsert(
      { workspace_id: workspaceId, entity_type: entityType, entity_id: entityId, updated_at: new Date().toISOString() },
      { onConflict: 'entity_type,entity_id' }
    )
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to upsert node')
  return (data as { id: string }).id
}

export async function scheduleEmbed(nodeId: string, text: string): Promise<void> {
  if (!text.trim()) return
  const supabase = await createClient()
  const delays = [1000, 2000, 4000]
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const embedding = await embed(text)
      const { error } = await supabase
        .from('nodes')
        .update({ embedding, updated_at: new Date().toISOString() })
        .eq('id', nodeId)
      if (error) throw new Error(error.message)
      return
    } catch (err) {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]))
      } else {
        console.error(`scheduleEmbed: all 3 attempts failed for node ${nodeId}:`, err)
      }
    }
  }
}

export async function upsertEdge(
  workspaceId: string,
  sourceNodeId: string,
  targetNodeId: string,
  relationshipType: 'parent_child' | 'mention' | 'backlink'
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('edges')
    .upsert(
      { workspace_id: workspaceId, source_node_id: sourceNodeId, target_node_id: targetNodeId, relationship_type: relationshipType },
      { onConflict: 'source_node_id,target_node_id,relationship_type', ignoreDuplicates: true }
    )
  if (error) throw new Error(error.message)
}

export async function findNodeId(
  entityType: 'page' | 'file' | 'database_row',
  entityId: string
): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nodes')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function clearMentionEdges(nodeId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('edges').delete().eq('source_node_id', nodeId).eq('relationship_type', 'mention')
  await supabase.from('edges').delete().eq('target_node_id', nodeId).eq('relationship_type', 'backlink')
}

export async function findPageNodeByTitle(
  workspaceId: string,
  title: string
): Promise<string | null> {
  const supabase = await createClient()
  const { data: page } = await supabase
    .from('pages')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('title', title)
    .maybeSingle()
  if (!page) return null
  return findNodeId('page', (page as { id: string }).id)
}
