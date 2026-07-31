'use server'

import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/graph/ollama'
import type { SearchResult, EntityType } from '@/lib/types/database'

export interface QueryScope {
  databaseId?: string
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function fetchPageContent(
  supabase: SupabaseClient,
  entityId: string
): Promise<Pick<SearchResult, 'title' | 'excerpt' | 'projectName' | 'projectDatabaseId'>> {
  const { data: page } = await supabase
    .from('pages')
    .select('id, title')
    .eq('id', entityId)
    .maybeSingle()
  if (!page) return { title: 'Untitled', excerpt: '', projectName: null, projectDatabaseId: null }

  const { data: dbRow } = await supabase
    .from('database_rows')
    .select('database_id')
    .eq('page_id', entityId)
    .maybeSingle()

  let projectName: string | null = null
  let projectDatabaseId: string | null = null
  if (dbRow) {
    const { data: db } = await supabase
      .from('databases')
      .select('id, page_id')
      .eq('id', (dbRow as { database_id: string }).database_id)
      .maybeSingle()
    if (db) {
      const { data: dbPage } = await supabase
        .from('pages')
        .select('title')
        .eq('id', (db as { page_id: string }).page_id)
        .maybeSingle()
      projectName = (dbPage as { title: string } | null)?.title ?? null
      projectDatabaseId = (db as { id: string }).id
    }
  }

  const { data: blocks } = await supabase
    .from('blocks')
    .select('content')
    .eq('page_id', entityId)
    .order('position', { ascending: true })
    .limit(3)

  const excerpt = ((blocks ?? []) as { content: { content?: { text?: string }[] } }[])
    .map(b => b.content.content?.map(n => n.text ?? '').join('') ?? '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 200)

  return { title: (page as { title: string }).title, excerpt, projectName, projectDatabaseId }
}

async function fetchRowContent(
  supabase: SupabaseClient,
  entityId: string
): Promise<Pick<SearchResult, 'title' | 'excerpt' | 'projectName' | 'projectDatabaseId'>> {
  const { data: row } = await supabase
    .from('database_rows')
    .select('id, database_id, fields')
    .eq('id', entityId)
    .maybeSingle()
  if (!row) return { title: 'Untitled Row', excerpt: '', projectName: null, projectDatabaseId: null }

  const fields = (row as { fields: Record<string, unknown> }).fields
  const rawTitle = fields['title'] ?? fields['name'] ?? fields['Name'] ?? 'Untitled Row'
  const title = String(rawTitle)
  const excerpt = Object.values(fields).map(v => String(v)).join(' | ').slice(0, 200)

  const { data: db } = await supabase
    .from('databases')
    .select('id, page_id')
    .eq('id', (row as { database_id: string }).database_id)
    .maybeSingle()

  let projectName: string | null = null
  let projectDatabaseId: string | null = null
  if (db) {
    const { data: dbPage } = await supabase
      .from('pages')
      .select('title')
      .eq('id', (db as { page_id: string }).page_id)
      .maybeSingle()
    projectName = (dbPage as { title: string } | null)?.title ?? null
    projectDatabaseId = (db as { id: string }).id
  }

  return { title, excerpt, projectName, projectDatabaseId }
}

async function fetchFileContent(
  supabase: SupabaseClient,
  entityId: string
): Promise<Pick<SearchResult, 'title' | 'excerpt' | 'projectName' | 'projectDatabaseId'>> {
  const { data: file } = await supabase
    .from('files')
    .select('storage_path, extracted_text')
    .eq('id', entityId)
    .maybeSingle()
  if (!file) return { title: 'Untitled File', excerpt: '', projectName: null, projectDatabaseId: null }
  const f = file as { storage_path: string; extracted_text: string | null }
  const title = f.storage_path.split('/').pop() ?? 'Untitled File'
  const excerpt = (f.extracted_text ?? '').slice(0, 200)
  return { title, excerpt, projectName: null, projectDatabaseId: null }
}

async function fetchSourceContent(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string
): Promise<Pick<SearchResult, 'title' | 'excerpt' | 'projectName' | 'projectDatabaseId'>> {
  if (entityType === 'page') return fetchPageContent(supabase, entityId)
  if (entityType === 'database_row') return fetchRowContent(supabase, entityId)
  if (entityType === 'file') return fetchFileContent(supabase, entityId)
  return { title: 'Unknown', excerpt: '', projectName: null, projectDatabaseId: null }
}

interface RpcNode {
  id: string
  entity_type: string
  entity_id: string
  similarity: number
}

interface EdgeRow {
  source_node_id: string
  target_node_id: string
}

export async function retrieveNodes(
  workspaceId: string,
  queryText: string,
  scope?: QueryScope
): Promise<SearchResult[]> {
  const supabase = await createClient()

  const queryEmbedding = await embed(queryText)

  const rpcParams: Record<string, unknown> = {
    query_embedding: queryEmbedding,
    match_workspace_id: workspaceId,
    match_count: 10,
  }
  if (scope?.databaseId) rpcParams['match_database_id'] = scope.databaseId

  const { data: topNodes, error: rpcError } = await supabase.rpc('match_nodes', rpcParams)
  if (rpcError) throw new Error(rpcError.message)

  const top = (topNodes ?? []) as RpcNode[]
  const topIds = top.map(n => n.id)
  const scoreMap = new Map<string, number>(top.map(n => [n.id, n.similarity]))

  const expandedIds = new Set<string>(topIds)

  if (topIds.length > 0) {
    const { data: edges } = await supabase
      .from('edges')
      .select('source_node_id, target_node_id')
      .or(`source_node_id.in.(${topIds.join(',')}),target_node_id.in.(${topIds.join(',')})`)
    for (const edge of (edges ?? []) as EdgeRow[]) {
      expandedIds.add(edge.source_node_id)
      expandedIds.add(edge.target_node_id)
    }
  }

  const newIds = [...expandedIds].filter(id => !topIds.includes(id))
  const allNodes: RpcNode[] = [...top]

  if (newIds.length > 0) {
    const { data: expanded } = await supabase
      .from('nodes')
      .select('id, entity_type, entity_id')
      .in('id', newIds)
    for (const n of (expanded ?? []) as Omit<RpcNode, 'similarity'>[]) {
      allNodes.push({ ...n, similarity: 0 })
    }
  }

  const results: SearchResult[] = []
  for (const node of allNodes) {
    const content = await fetchSourceContent(supabase, node.entity_type as EntityType, node.entity_id)
    results.push({
      nodeId: node.id,
      entityType: node.entity_type as EntityType,
      entityId: node.entity_id,
      ...content,
      score: scoreMap.get(node.id) ?? 0,
    })
  }

  return results.sort((a, b) => b.score - a.score)
}
