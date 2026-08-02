'use server'

import { createClient } from '@/lib/supabase/server'
import { retrieveNodes } from '@/lib/graph/query'
import type { SearchResult, EntityType, QueryLog } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

export async function getRecentQueries(workspaceId: string, limit = 8): Promise<QueryLog[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('query_logs')
    .select('id, workspace_id, user_id, query, response, sources, created_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .not('response', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as QueryLog[]
}

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
