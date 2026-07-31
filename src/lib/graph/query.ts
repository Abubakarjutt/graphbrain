'use server'

import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/graph/ollama'
import type { SearchResult, EntityType } from '@/lib/types/database'

export interface QueryScope {
  databaseId?: string
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

type ContentSnippet = Pick<SearchResult, 'title' | 'excerpt' | 'projectName' | 'projectDatabaseId'>

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchContentBatch(
  supabase: SupabaseClient,
  nodes: RpcNode[]
): Promise<Map<string, ContentSnippet>> {
  const pageIds = nodes.filter(n => n.entity_type === 'page').map(n => n.entity_id)
  const rowIds = nodes.filter(n => n.entity_type === 'database_row').map(n => n.entity_id)
  const fileIds = nodes.filter(n => n.entity_type === 'file').map(n => n.entity_id)

  // Parallel batch fetches — replaces per-node N+1 queries
  const [pagesRes, blocksRes, pageDbRowsRes, rowsRes, filesRes] = await Promise.all([
    pageIds.length > 0
      ? supabase.from('pages').select('id, title').in('id', pageIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    pageIds.length > 0
      ? supabase.from('blocks').select('page_id, content').in('page_id', pageIds).order('position', { ascending: true })
      : Promise.resolve({ data: [] as { page_id: string; content: { content?: { text?: string }[] } }[] }),
    pageIds.length > 0
      ? supabase.from('database_rows').select('page_id, database_id').in('page_id', pageIds)
      : Promise.resolve({ data: [] as { page_id: string; database_id: string }[] }),
    rowIds.length > 0
      ? supabase.from('database_rows').select('id, database_id, fields').in('id', rowIds)
      : Promise.resolve({ data: [] as { id: string; database_id: string; fields: Record<string, unknown> }[] }),
    fileIds.length > 0
      ? supabase.from('files').select('id, storage_path, extracted_text').in('id', fileIds)
      : Promise.resolve({ data: [] as { id: string; storage_path: string; extracted_text: string | null }[] }),
  ])

  type PageDbRow = { page_id: string; database_id: string }
  type Row = { id: string; database_id: string; fields: Record<string, unknown> }
  type DbEntry = { id: string; page_id: string }
  type DbPage = { id: string; title: string }

  const pageDbRows = (pageDbRowsRes.data ?? []) as PageDbRow[]
  const rows = (rowsRes.data ?? []) as Row[]

  // Collect all database IDs for project name resolution
  const dbIdSet = new Set<string>([
    ...pageDbRows.map(r => r.database_id),
    ...rows.map(r => r.database_id),
  ])

  // project name map: database_id → { name, dbId }
  const projectMap = new Map<string, { name: string | null; dbId: string }>()

  if (dbIdSet.size > 0) {
    const { data: dbs } = await supabase
      .from('databases')
      .select('id, page_id')
      .in('id', [...dbIdSet])
    const dbEntries = (dbs ?? []) as DbEntry[]
    const dbPageIds = [...new Set(dbEntries.map(d => d.page_id))]

    let dbPages: DbPage[] = []
    if (dbPageIds.length > 0) {
      const { data: dbPagesData } = await supabase
        .from('pages')
        .select('id, title')
        .in('id', dbPageIds)
      dbPages = (dbPagesData ?? []) as DbPage[]
    }

    const dbPageTitleMap = new Map(dbPages.map(p => [p.id, p.title]))
    for (const db of dbEntries) {
      projectMap.set(db.id, { name: dbPageTitleMap.get(db.page_id) ?? null, dbId: db.id })
    }
  }

  // page_id → database_id
  const pageToDbId = new Map(pageDbRows.map(r => [r.page_id, r.database_id]))

  // page_id → excerpt (first 3 non-empty text blocks)
  type Block = { page_id: string; content: { content?: { text?: string }[] } }
  const blocksPerPage = new Map<string, string[]>()
  for (const b of (blocksRes.data ?? []) as Block[]) {
    const texts = blocksPerPage.get(b.page_id) ?? []
    if (texts.length < 3) {
      const text = b.content.content?.map(n => n.text ?? '').join('') ?? ''
      if (text) texts.push(text)
    }
    blocksPerPage.set(b.page_id, texts)
  }

  const result = new Map<string, ContentSnippet>()

  // Hydrate pages
  for (const page of (pagesRes.data ?? []) as { id: string; title: string }[]) {
    const dbId = pageToDbId.get(page.id)
    const project = dbId ? projectMap.get(dbId) : undefined
    result.set(page.id, {
      title: page.title,
      excerpt: (blocksPerPage.get(page.id) ?? []).join(' ').slice(0, 200),
      projectName: project?.name ?? null,
      projectDatabaseId: project?.dbId ?? null,
    })
  }

  // Hydrate database rows
  for (const row of rows) {
    const fields = row.fields
    const rawTitle = fields['title'] ?? fields['name'] ?? fields['Name'] ?? 'Untitled Row'
    const excerpt = Object.values(fields)
      .filter(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(v => String(v))
      .join(' | ')
      .slice(0, 200)
    const project = projectMap.get(row.database_id)
    result.set(row.id, {
      title: String(rawTitle),
      excerpt,
      projectName: project?.name ?? null,
      projectDatabaseId: project?.dbId ?? null,
    })
  }

  // Hydrate files
  for (const file of (filesRes.data ?? []) as { id: string; storage_path: string; extracted_text: string | null }[]) {
    result.set(file.id, {
      title: file.storage_path.split('/').pop() ?? 'Untitled File',
      excerpt: (file.extracted_text ?? '').slice(0, 200),
      projectName: null,
      projectDatabaseId: null,
    })
  }

  return result
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
    // Validate UUIDs before interpolating into the .or() filter string
    const safeIds = topIds.filter(id => UUID_RE.test(id))
    if (safeIds.length > 0) {
      const { data: edges } = await supabase
        .from('edges')
        .select('source_node_id, target_node_id')
        .or(`source_node_id.in.(${safeIds.join(',')}),target_node_id.in.(${safeIds.join(',')})`)
      for (const edge of (edges ?? []) as EdgeRow[]) {
        expandedIds.add(edge.source_node_id)
        expandedIds.add(edge.target_node_id)
      }
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

  // Batch-fetch all content in ~7 queries instead of N*4 sequential queries
  const contentMap = await fetchContentBatch(supabase, allNodes)

  const results: SearchResult[] = allNodes.map(node => ({
    nodeId: node.id,
    entityType: node.entity_type as EntityType,
    entityId: node.entity_id,
    ...(contentMap.get(node.entity_id) ?? { title: 'Untitled', excerpt: '', projectName: null, projectDatabaseId: null }),
    score: scoreMap.get(node.id) ?? 0,
  }))

  return results.sort((a, b) => b.score - a.score)
}
