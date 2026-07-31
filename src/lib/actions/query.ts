'use server'

import { createClient } from '@/lib/supabase/server'
import { retrieveNodes } from '@/lib/graph/query'
import type { SearchResult, EntityType } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

export async function searchQuery(
  workspaceId: string,
  query: string,
  scope?: QueryScope
): Promise<SearchResult[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  try {
    return await retrieveNodes(workspaceId, query, scope)
  } catch (err) {
    console.error('[searchQuery] retrieveNodes failed, falling back to text search:', err)
    try {
      const { data: pages } = await supabase
        .from('pages')
        .select('id, title')
        .eq('workspace_id', workspaceId)
        .ilike('title', `%${query}%`)
        .limit(10)
      return ((pages ?? []) as { id: string; title: string }[]).map(p => ({
        nodeId: '',
        entityType: 'page' as EntityType,
        entityId: p.id,
        title: p.title,
        excerpt: '(text search — AI features unavailable)',
        projectName: null,
        projectDatabaseId: null,
        score: 0,
      }))
    } catch {
      return { error: 'Search failed' }
    }
  }
}
