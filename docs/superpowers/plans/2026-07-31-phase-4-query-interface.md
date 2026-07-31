# Phase 4: Query Interface (Cmd+K) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Cmd+K modal with semantic Search and streaming AI Ask modes, backed by pgvector + 1-hop graph traversal, enabling cross-project knowledge discovery.

**Architecture:** Server Action for Search (consistent with existing codebase), Route Handler at `/api/query/ask` for streaming Ask (uses `ReadableStream` to pipe Ollama NDJSON tokens). Core retrieval in `src/lib/graph/query.ts` embeds the query, runs pgvector top-10 via a Postgres RPC function, expands 1 hop via the `edges` table, fetches source content, and returns `SearchResult[]`. The `CmdKModal` client component listens globally for `Cmd+K`, renders inline inside `AppShell`.

**Tech Stack:** Next.js 16 App Router, Vitest, React Testing Library, Supabase JS v2, Ollama `llama3.1:8b` + `nomic-embed-text`, pgvector `<=>` cosine operator.

---

## File Map

| Action | Path |
|---|---|
| Modify | `src/lib/types/database.ts` |
| Modify | `src/lib/graph/ollama.ts` |
| Modify | `src/__tests__/lib/graph/ollama.test.ts` |
| Create | `supabase/migrations/20260731000003_match_nodes_function.sql` |
| Create | `src/lib/graph/query.ts` |
| Create | `src/__tests__/lib/graph/query.test.ts` |
| Create | `src/lib/actions/query.ts` |
| Create | `src/__tests__/lib/actions/query.test.ts` |
| Create | `src/app/api/query/ask/route.ts` |
| Create | `src/__tests__/app/api/query/ask.test.ts` |
| Create | `src/components/query/SearchResults.tsx` |
| Create | `src/components/query/AskPanel.tsx` |
| Create | `src/components/query/CmdKModal.tsx` |
| Create | `src/__tests__/components/query/CmdKModal.test.tsx` |
| Modify | `src/components/layout/AppShell.tsx` |

---

### Task 1: Add `SearchResult` type and `streamChat` to ollama

**Files:**
- Modify: `src/lib/types/database.ts`
- Modify: `src/lib/graph/ollama.ts`
- Modify: `src/__tests__/lib/graph/ollama.test.ts`

- [ ] **Step 1: Add the failing `streamChat` test**

Append to `src/__tests__/lib/graph/ollama.test.ts` inside the top-level `describe` block (after the existing `embed` describe):

```ts
  describe('streamChat', () => {
    it('yields tokens from NDJSON stream', async () => {
      const lines = [
        JSON.stringify({ response: 'Hello', done: false }),
        JSON.stringify({ response: ' world', done: false }),
        JSON.stringify({ response: '', done: true }),
      ].join('\n')
      const encoder = new TextEncoder()
      let sent = false
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (!sent) { sent = true; return { done: false, value: encoder.encode(lines) } }
              return { done: true, value: undefined }
            },
          }),
        },
      }))
      const { streamChat } = await import('@/lib/graph/ollama')
      const tokens: string[] = []
      for await (const token of streamChat('test prompt')) tokens.push(token)
      expect(tokens).toEqual(['Hello', ' world', ''])
    })

    it('throws when Ollama returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
      const { streamChat } = await import('@/lib/graph/ollama')
      const gen = streamChat('test')
      await expect(gen.next()).rejects.toThrow('Ollama generate failed: 500')
    })
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/Apple/projects/graphbrain && npx vitest run src/__tests__/lib/graph/ollama.test.ts
```

Expected: two new tests FAIL with "streamChat is not a function".

- [ ] **Step 3: Add `SearchResult` type to `src/lib/types/database.ts`**

Append after the `QueryLog` interface:

```ts
export interface SearchResult {
  nodeId: string
  entityType: EntityType
  entityId: string
  title: string
  excerpt: string
  projectName: string | null
  projectDatabaseId: string | null
  score: number
}
```

- [ ] **Step 4: Add `streamChat` to `src/lib/graph/ollama.ts`**

Append after `checkHealth`:

```ts
export async function* streamChat(prompt: string, timeoutMs = 120_000): AsyncGenerator<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.1:8b', prompt, stream: true }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
        const json = JSON.parse(line) as { response: string; done: boolean }
        yield json.response
      }
    }
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
npx vitest run src/__tests__/lib/graph/ollama.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/database.ts src/lib/graph/ollama.ts src/__tests__/lib/graph/ollama.test.ts
git commit -m "feat: add SearchResult type and streamChat to ollama"
```

---

### Task 2: Migration — `match_nodes` Postgres function

**Files:**
- Create: `supabase/migrations/20260731000003_match_nodes_function.sql`

This migration creates the RPC function `match_nodes` that the retrieval engine calls via `supabase.rpc()`. It uses pgvector's `<=>` cosine distance operator. An optional `match_database_id` parameter scopes results to a specific database's nodes.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260731000003_match_nodes_function.sql`:

```sql
CREATE OR REPLACE FUNCTION match_nodes(
  query_embedding vector(768),
  match_workspace_id uuid,
  match_count int DEFAULT 10,
  match_database_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  entity_type text,
  entity_id uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT n.id, n.entity_type, n.entity_id,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM nodes n
  WHERE n.workspace_id = match_workspace_id
    AND n.embedding IS NOT NULL
    AND (
      match_database_id IS NULL
      OR n.entity_id IN (
        SELECT dr.id FROM database_rows dr WHERE dr.database_id = match_database_id
        UNION
        SELECT dr.page_id FROM database_rows dr
          WHERE dr.database_id = match_database_id AND dr.page_id IS NOT NULL
      )
    )
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

- [ ] **Step 2: Apply locally (if using local Supabase)**

```bash
npx supabase db push
```

If not running local Supabase, apply via the Supabase dashboard SQL editor. The tests mock `supabase.rpc()` directly so this does not block testing.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260731000003_match_nodes_function.sql
git commit -m "feat: add match_nodes pgvector RPC function"
```

---

### Task 3: Core retrieval engine (`src/lib/graph/query.ts`)

**Files:**
- Create: `src/lib/graph/query.ts`
- Create: `src/__tests__/lib/graph/query.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/graph/query.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/graph/ollama', () => ({ embed: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/graph/ollama'
import type { Mock } from 'vitest'

const mockRpc = vi.fn()
const mockEdgesOr = vi.fn()
const mockEdgesSelect = vi.fn(() => ({ or: mockEdgesOr }))
const mockNodesIn = vi.fn()
const mockNodesSelect = vi.fn(() => ({ in: mockNodesIn }))

// Per-table mock factory
function makeFrom(tableOverrides: Record<string, () => unknown>) {
  return (table: string) => {
    if (tableOverrides[table]) return tableOverrides[table]()
    // Default: pages / files / database_rows content fetch chain
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
    }
  }
}

describe('retrieveNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(embed as Mock).mockResolvedValue(new Array(768).fill(0.1))
  })

  it('returns top-10 nodes plus 1-hop expanded nodes, deduped', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: 'node1', entity_type: 'page', entity_id: 'page1', similarity: 0.9 },
        { id: 'node2', entity_type: 'page', entity_id: 'page2', similarity: 0.8 },
      ],
      error: null,
    })
    // Edges: node1 is connected to node3 (expanded)
    mockEdgesOr.mockResolvedValue({
      data: [{ source_node_id: 'node1', target_node_id: 'node3' }],
    })
    // Expanded node fetch
    mockNodesIn.mockResolvedValue({
      data: [{ id: 'node3', entity_type: 'page', entity_id: 'page3' }],
    })

    ;(createClient as Mock).mockResolvedValue({
      rpc: mockRpc,
      from: makeFrom({
        edges: () => ({ select: mockEdgesSelect }),
        nodes: () => ({ select: mockNodesSelect }),
      }),
    })

    const { retrieveNodes } = await import('@/lib/graph/query')
    const results = await retrieveNodes('ws1', 'test query')
    expect(results).toHaveLength(3)
    expect(results[0].score).toBe(0.9)
    expect(results[2].nodeId).toBe('node3')
    expect(results[2].score).toBe(0)
  })

  it('passes databaseId scope to rpc', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockEdgesOr.mockResolvedValue({ data: [] })
    ;(createClient as Mock).mockResolvedValue({
      rpc: mockRpc,
      from: makeFrom({ edges: () => ({ select: mockEdgesSelect }) }),
    })

    const { retrieveNodes } = await import('@/lib/graph/query')
    await retrieveNodes('ws1', 'test', { databaseId: 'db1' })
    expect(mockRpc).toHaveBeenCalledWith('match_nodes', expect.objectContaining({
      match_database_id: 'db1',
    }))
  })

  it('propagates error when embed() throws', async () => {
    ;(embed as Mock).mockRejectedValue(new Error('Ollama down'))
    ;(createClient as Mock).mockResolvedValue({ rpc: mockRpc, from: vi.fn() })

    const { retrieveNodes } = await import('@/lib/graph/query')
    await expect(retrieveNodes('ws1', 'test')).rejects.toThrow('Ollama down')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/__tests__/lib/graph/query.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/graph/query'".

- [ ] **Step 3: Create `src/lib/graph/query.ts`**

```ts
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
      .eq('id', dbRow.database_id)
      .maybeSingle()
    if (db) {
      const { data: dbPage } = await supabase
        .from('pages')
        .select('title')
        .eq('id', db.page_id)
        .maybeSingle()
      projectName = (dbPage as { title: string } | null)?.title ?? null
      projectDatabaseId = db.id
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/__tests__/lib/graph/query.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/graph/query.ts src/__tests__/lib/graph/query.test.ts
git commit -m "feat: add retrieval engine with pgvector + 1-hop graph expansion"
```

---

### Task 4: `searchQuery` Server Action

**Files:**
- Create: `src/lib/actions/query.ts`
- Create: `src/__tests__/lib/actions/query.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/actions/query.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/graph/query', () => ({ retrieveNodes: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { retrieveNodes } from '@/lib/graph/query'
import { createClient } from '@/lib/supabase/server'
import type { Mock } from 'vitest'

const mockIlike = vi.fn()
const mockLimit = vi.fn()
const mockEq = vi.fn(() => ({ ilike: mockIlike }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

beforeEach(() => {
  vi.clearAllMocks()
  ;(createClient as Mock).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })
  mockIlike.mockReturnValue({ limit: mockLimit })
  mockLimit.mockResolvedValue({ data: [] })
})

describe('searchQuery', () => {
  it('returns SearchResult[] from retrieveNodes on success', async () => {
    const fakeResults = [{ nodeId: 'n1', title: 'Page A', score: 0.9 }]
    ;(retrieveNodes as Mock).mockResolvedValue(fakeResults)

    const { searchQuery } = await import('@/lib/actions/query')
    const result = await searchQuery('ws1', 'graph rag')
    expect(result).toEqual(fakeResults)
  })

  it('falls back to ILIKE on Ollama error', async () => {
    ;(retrieveNodes as Mock).mockRejectedValue(new Error('Ollama down'))
    mockLimit.mockResolvedValue({ data: [{ id: 'p1', title: 'Graph RAG Project' }] })

    const { searchQuery } = await import('@/lib/actions/query')
    const result = await searchQuery('ws1', 'graph rag')
    expect(Array.isArray(result)).toBe(true)
    const arr = result as { title: string }[]
    expect(arr[0].title).toBe('Graph RAG Project')
    expect(arr[0]).toHaveProperty('excerpt', '(text search — AI features unavailable)')
  })

  it('returns error object if unauthenticated', async () => {
    ;(createClient as Mock).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: mockFrom,
    })

    const { searchQuery } = await import('@/lib/actions/query')
    const result = await searchQuery('ws1', 'test')
    expect(result).toEqual({ error: 'Unauthenticated' })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/__tests__/lib/actions/query.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/actions/query'".

- [ ] **Step 3: Create `src/lib/actions/query.ts`**

```ts
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
  } catch {
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/__tests__/lib/actions/query.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/query.ts src/__tests__/lib/actions/query.test.ts
git commit -m "feat: add searchQuery Server Action with ILIKE fallback"
```

---

### Task 5: Streaming Ask Route Handler

**Files:**
- Create: `src/app/api/query/ask/route.ts`
- Create: `src/__tests__/app/api/query/ask.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/app/api/query/ask.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/graph/query', () => ({ retrieveNodes: vi.fn() }))
vi.mock('@/lib/graph/ollama', () => ({ streamChat: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { retrieveNodes } from '@/lib/graph/query'
import { streamChat } from '@/lib/graph/ollama'
import type { Mock } from 'vitest'

const fakeSource = {
  nodeId: 'n1', entityType: 'page', entityId: 'p1',
  title: 'Graph RAG Design', excerpt: 'We used LlamaIndex.',
  projectName: 'Project Alpha', projectDatabaseId: 'db1', score: 0.9,
}

function makeSupabase(user: { id: string } | null) {
  const mockInsert = vi.fn().mockResolvedValue({ error: null })
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(() => ({ insert: mockInsert })),
    _mockInsert: mockInsert,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/query/ask', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(createClient as Mock).mockResolvedValue(makeSupabase(null))
    const { POST } = await import('@/app/api/query/ask/route')
    const req = new Request('http://localhost/api/query/ask', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'ws1', query: 'test' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('streams tokens and sets X-Sources header', async () => {
    ;(createClient as Mock).mockResolvedValue(makeSupabase({ id: 'u1' }))
    ;(retrieveNodes as Mock).mockResolvedValue([fakeSource])
    async function* gen() { yield 'Hello'; yield ' world' }
    ;(streamChat as Mock).mockReturnValue(gen())

    const { POST } = await import('@/app/api/query/ask/route')
    const req = new Request('http://localhost/api/query/ask', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'ws1', query: 'What is Graph RAG?' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Sources')).toBeTruthy()
    const sources = JSON.parse(res.headers.get('X-Sources')!)
    expect(sources[0].title).toBe('Graph RAG Design')

    const text = await res.text()
    expect(text).toBe('Hello world')
  })

  it('logs to query_logs after stream completes', async () => {
    const supabase = makeSupabase({ id: 'u1' })
    ;(createClient as Mock).mockResolvedValue(supabase)
    ;(retrieveNodes as Mock).mockResolvedValue([fakeSource])
    async function* gen() { yield 'Answer' }
    ;(streamChat as Mock).mockReturnValue(gen())

    const { POST } = await import('@/app/api/query/ask/route')
    const req = new Request('http://localhost/api/query/ask', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'ws1', query: 'test' }),
    })
    const res = await POST(req)
    await res.text() // drain stream
    expect(supabase._mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'test', response: 'Answer' })
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/__tests__/app/api/query/ask.test.ts
```

Expected: FAIL — "Cannot find module '@/app/api/query/ask/route'".

- [ ] **Step 3: Create `src/app/api/query/ask/route.ts`**

```ts
import { createClient } from '@/lib/supabase/server'
import { retrieveNodes } from '@/lib/graph/query'
import { streamChat } from '@/lib/graph/ollama'
import type { SearchResult } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

function buildPrompt(query: string, sources: SearchResult[]): string {
  const context = sources
    .map(s => {
      const project = s.projectName ? ` [Project: ${s.projectName}]` : ''
      return `### ${s.title}${project}\n${s.excerpt}`
    })
    .join('\n\n')
  return [
    'You are a knowledge assistant. Answer using ONLY the context below.',
    'Cite sources by their title. If the answer is not in the context, say so clearly.',
    '',
    'Context:',
    context,
    '',
    `Question: ${query}`,
  ].join('\n')
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json() as { workspaceId: string; query: string; scope?: QueryScope }
  const { workspaceId, query, scope } = body

  let sources: SearchResult[] = []
  let prompt: string
  try {
    sources = await retrieveNodes(workspaceId, query, scope)
    prompt = buildPrompt(query, sources)
  } catch {
    return new Response('AI unavailable — start Ollama with `ollama serve`', { status: 503 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = ''
      try {
        for await (const token of streamChat(prompt)) {
          controller.enqueue(new TextEncoder().encode(token))
          fullResponse += token
        }
      } catch {
        controller.enqueue(new TextEncoder().encode('\n\n[Response cut short — Ollama timed out]'))
      }
      try {
        await supabase.from('query_logs').insert({
          workspace_id: workspaceId,
          user_id: user.id,
          query,
          response: fullResponse,
          sources: sources.map(s => ({
            node_id: s.nodeId,
            entity_type: s.entityType,
            entity_id: s.entityId,
            title: s.title,
          })),
        })
      } catch (err) {
        console.error('query_logs insert failed:', err)
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Sources': JSON.stringify(sources),
    },
  })
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/__tests__/app/api/query/ask.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/query/ask/route.ts src/__tests__/app/api/query/ask.test.ts
git commit -m "feat: add streaming Ask route handler with query_logs"
```

---

### Task 6: Display components — `SearchResults` and `AskPanel`

**Files:**
- Create: `src/components/query/SearchResults.tsx`
- Create: `src/components/query/AskPanel.tsx`

These are pure display components with no complex logic. No dedicated tests — they are covered by CmdKModal integration.

- [ ] **Step 1: Create `src/components/query/SearchResults.tsx`**

```tsx
'use client'

import Link from 'next/link'
import type { SearchResult } from '@/lib/types/database'

interface SearchResultsProps {
  results: SearchResult[]
  workspaceId: string
  onNavigate: () => void
}

function entityHref(workspaceId: string, result: SearchResult): string {
  if (result.entityType === 'page' || result.entityType === 'database_row') {
    return `/workspace/${workspaceId}/page/${result.entityId}`
  }
  if (result.entityType === 'file') {
    return `/workspace/${workspaceId}/page/${result.entityId}`
  }
  return `/workspace/${workspaceId}`
}

export function SearchResults({ results, workspaceId, onNavigate }: SearchResultsProps) {
  if (results.length === 0) return null

  const byProject = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r.projectName ?? '__standalone__'
    acc[key] = [...(acc[key] ?? []), r]
    return acc
  }, {})

  return (
    <div className="divide-y divide-border">
      {Object.entries(byProject).map(([projectKey, items]) => (
        <div key={projectKey} className="py-2">
          {projectKey !== '__standalone__' && (
            <p className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {projectKey}
            </p>
          )}
          {items.map(result => (
            <Link
              key={result.nodeId || result.entityId}
              href={entityHref(workspaceId, result)}
              onClick={onNavigate}
              className="flex flex-col px-4 py-2 hover:bg-accent rounded-md group"
            >
              <span className="text-sm font-medium group-hover:text-accent-foreground">
                {result.title}
              </span>
              {result.excerpt && (
                <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {result.excerpt}
                </span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/query/AskPanel.tsx`**

```tsx
'use client'

import Link from 'next/link'
import type { SearchResult } from '@/lib/types/database'

interface AskPanelProps {
  response: string
  sources: SearchResult[]
  loading: boolean
  error: string | null
  workspaceId: string
}

export function AskPanel({ response, sources, loading, error, workspaceId }: AskPanelProps) {
  if (error) {
    return (
      <div className="px-4 py-6 text-sm text-destructive">{error}</div>
    )
  }

  if (loading && !response) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground animate-pulse">
        Searching knowledge graph…
      </div>
    )
  }

  if (!response) return null

  return (
    <div className="px-4 py-4 space-y-4">
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{response}</p>
      {sources.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Sources
          </p>
          <ul className="space-y-1">
            {sources.map(s => (
              <li key={s.nodeId || s.entityId}>
                <Link
                  href={`/workspace/${workspaceId}/page/${s.entityId}`}
                  className="text-xs text-primary hover:underline"
                >
                  {s.title}
                  {s.projectName && (
                    <span className="text-muted-foreground"> ({s.projectName})</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/query/SearchResults.tsx src/components/query/AskPanel.tsx
git commit -m "feat: add SearchResults and AskPanel display components"
```

---

### Task 7: `CmdKModal` — the global query modal

**Files:**
- Create: `src/components/query/CmdKModal.tsx`
- Create: `src/__tests__/components/query/CmdKModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/components/query/CmdKModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ workspaceId: 'ws1' })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/lib/actions/query', () => ({
  searchQuery: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/components/query/SearchResults', () => ({
  SearchResults: () => <div data-testid="search-results" />,
}))

vi.mock('@/components/query/AskPanel', () => ({
  AskPanel: () => <div data-testid="ask-panel" />,
}))

import { CmdKModal } from '@/components/query/CmdKModal'
import type { Database } from '@/lib/types/database'

const fakeDatabases: Database[] = [
  { id: 'db1', page_id: 'p1', schema: [], created_at: '' },
]

describe('CmdKModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is not visible on initial render', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on Cmd+K', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens on Ctrl+K', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when clicking the overlay', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.click(screen.getByTestId('modal-overlay'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/__tests__/components/query/CmdKModal.test.tsx
```

Expected: FAIL — "Cannot find module '@/components/query/CmdKModal'".

- [ ] **Step 3: Create `src/components/query/CmdKModal.tsx`**

```tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { searchQuery } from '@/lib/actions/query'
import { SearchResults } from './SearchResults'
import { AskPanel } from './AskPanel'
import type { Database, SearchResult } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

interface CmdKModalProps {
  databases: Database[]
}

type Mode = 'search' | 'ask'

export function CmdKModal({ databases }: CmdKModalProps) {
  const params = useParams()
  const workspaceId = params?.workspaceId as string | undefined
  const currentDatabaseId = params?.databaseId as string | undefined

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<QueryScope>({})
  const [results, setResults] = useState<SearchResult[]>([])
  const [response, setResponse] = useState('')
  const [sources, setSources] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setResponse('')
    setSources([])
    setError(null)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      if (currentDatabaseId) setScope({ databaseId: currentDatabaseId })
    }
  }, [open, currentDatabaseId])

  // Debounced search in Search mode
  useEffect(() => {
    if (mode !== 'search' || !query.trim() || !workspaceId) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      const res = await searchQuery(workspaceId, query, scope)
      if ('error' in res) {
        setError(res.error)
        setResults([])
      } else {
        setResults(res)
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, mode, workspaceId, scope])

  async function handleAsk() {
    if (!query.trim() || !workspaceId) return
    setLoading(true)
    setResponse('')
    setSources([])
    setError(null)

    const res = await fetch('/api/query/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, query, scope }),
    })

    if (!res.ok) {
      setError('AI unavailable — start Ollama with `ollama serve`')
      setLoading(false)
      return
    }

    const sourcesHeader = res.headers.get('X-Sources')
    if (sourcesHeader) setSources(JSON.parse(sourcesHeader) as SearchResult[])

    setLoading(false)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      setResponse(prev => prev + decoder.decode(value))
    }
  }

  if (!workspaceId || !open) return null

  return (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24"
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search or ask"
        className="w-full max-w-2xl bg-background rounded-xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center px-4 py-3 border-b border-border gap-2">
          <span className="text-muted-foreground text-sm">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search or ask anything…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && mode === 'ask') handleAsk() }}
          />
          <button
            onClick={close}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
            aria-label="Close"
          >
            Esc
          </button>
        </div>

        {/* Mode + scope row */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex gap-1">
            {(['search', 'ask'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setResults([]); setResponse(''); setError(null) }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'search' ? 'Search' : 'Ask'}
              </button>
            ))}
          </div>
          <select
            value={scope.databaseId ?? ''}
            onChange={e => setScope(e.target.value ? { databaseId: e.target.value } : {})}
            className="text-xs bg-transparent border border-border rounded px-2 py-1 text-muted-foreground"
            aria-label="Scope"
          >
            <option value="">Entire workspace</option>
            {databases.map(db => (
              <option key={db.id} value={db.id}>
                {db.id}
              </option>
            ))}
          </select>
        </div>

        {/* Results / response area */}
        <div className="max-h-96 overflow-y-auto">
          {mode === 'search' && (
            <>
              {loading && (
                <p className="px-4 py-3 text-xs text-muted-foreground animate-pulse">Searching…</p>
              )}
              {!loading && query && results.length === 0 && !error && (
                <p className="px-4 py-6 text-sm text-center text-muted-foreground">
                  No results yet — content is still being indexed
                </p>
              )}
              {error && (
                <p className="px-4 py-3 text-sm text-destructive">{error}</p>
              )}
              <SearchResults results={results} workspaceId={workspaceId} onNavigate={close} />
            </>
          )}
          {mode === 'ask' && (
            <AskPanel
              response={response}
              sources={sources}
              loading={loading}
              error={error}
              workspaceId={workspaceId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/__tests__/components/query/CmdKModal.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/query/CmdKModal.tsx src/__tests__/components/query/CmdKModal.test.tsx
git commit -m "feat: add CmdKModal with Search and Ask modes"
```

---

### Task 8: Wire `CmdKModal` into `AppShell`

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

No new tests — `AppShell` already has layout tests; the keyboard listener and modal open/close are covered by `CmdKModal.test.tsx`.

- [ ] **Step 1: Read the current `AppShell`**

Open `src/components/layout/AppShell.tsx`. Current content:

```tsx
'use client'

import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'
import { Sidebar } from './Sidebar'
import { OllamaStatusBanner } from './OllamaStatusBanner'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
  ollamaAvailable?: boolean
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, databases, ollamaAvailable = true, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden flex-col">
      <OllamaStatusBanner ollamaAvailable={ollamaAvailable} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar workspaces={workspaces} user={user} pages={pages} databases={databases} />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `CmdKModal` import and render**

Replace the entire file with:

```tsx
'use client'

import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'
import { Sidebar } from './Sidebar'
import { OllamaStatusBanner } from './OllamaStatusBanner'
import { CmdKModal } from '@/components/query/CmdKModal'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
  ollamaAvailable?: boolean
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, databases, ollamaAvailable = true, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden flex-col">
      <OllamaStatusBanner ollamaAvailable={ollamaAvailable} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar workspaces={workspaces} user={user} pages={pages} databases={databases} />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
      <CmdKModal databases={databases} />
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: wire CmdKModal into AppShell"
```
