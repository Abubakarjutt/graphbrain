# Phase 3: Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically populate `nodes` and `edges` tables as pages, files, and database rows are created/edited, generate semantic embeddings via Ollama, and show a banner when Ollama is unreachable.

**Architecture:** Three new modules in `src/lib/graph/` — an Ollama HTTP client, pure content-extraction functions, and graph server actions. Embedding is scheduled via `next/server`'s `after()` (same pattern as file extraction), so page saves never block on Ollama. Edges (parent_child, mention, backlink) are created at the same trigger points as node upserts.

**Tech Stack:** Next.js `after()`, Supabase Postgres + pgvector, Ollama (`nomic-embed-text`, 768 dims), Vitest + jsdom

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260731000002_nodes_unique_constraint.sql` | Create |
| `src/lib/graph/ollama.ts` | Create |
| `src/lib/graph/content.ts` | Create |
| `src/lib/graph/graph.ts` | Create |
| `src/components/layout/OllamaStatusBanner.tsx` | Create |
| `src/__tests__/lib/graph/ollama.test.ts` | Create |
| `src/__tests__/lib/graph/content.test.ts` | Create |
| `src/__tests__/lib/graph/graph.test.ts` | Create |
| `src/__tests__/components/layout/OllamaStatusBanner.test.tsx` | Create |
| `src/app/(app)/layout.tsx` | Modify |
| `src/components/layout/AppShell.tsx` | Modify |
| `src/lib/actions/pages.ts` | Modify |
| `src/components/editor/PageEditor.tsx` | Modify |
| `src/lib/actions/files.ts` | Modify |
| `src/lib/actions/databases.ts` | Modify |
| `src/__tests__/lib/actions/pages.test.ts` | Modify |
| `src/__tests__/lib/actions/databases.test.ts` | Modify |

---

### Task 1: Migration — unique constraints on nodes and edges

**Files:**
- Create: `supabase/migrations/20260731000002_nodes_unique_constraint.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Enables safe upsert on nodes: ON CONFLICT (entity_type, entity_id) DO UPDATE
ALTER TABLE nodes
  ADD CONSTRAINT nodes_entity_unique UNIQUE (entity_type, entity_id);

-- Enables idempotent edge creation: ON CONFLICT DO NOTHING
ALTER TABLE edges
  ADD CONSTRAINT edges_unique UNIQUE (source_node_id, target_node_id, relationship_type);
```

- [ ] **Step 2: Verify file exists**

Run: `ls supabase/migrations/`
Expected: `20260731000002_nodes_unique_constraint.sql` appears in the list.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260731000002_nodes_unique_constraint.sql
git commit -m "chore: add unique constraints to nodes and edges for safe upserts"
```

---

### Task 2: Ollama client

**Files:**
- Create: `src/lib/graph/ollama.ts`
- Create: `src/__tests__/lib/graph/ollama.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/graph/ollama.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ollama client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  describe('checkHealth', () => {
    it('returns true when Ollama responds with 200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
      const { checkHealth } = await import('@/lib/graph/ollama')
      expect(await checkHealth()).toBe(true)
    })

    it('returns false when Ollama returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
      const { checkHealth } = await import('@/lib/graph/ollama')
      expect(await checkHealth()).toBe(false)
    })

    it('returns false when fetch throws (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
      const { checkHealth } = await import('@/lib/graph/ollama')
      expect(await checkHealth()).toBe(false)
    })
  })

  describe('embed', () => {
    it('POSTs to /api/embeddings and returns the embedding array', async () => {
      const embedding = Array(768).fill(0.1)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ embedding }),
      }))
      const { embed } = await import('@/lib/graph/ollama')
      const result = await embed('hello world')
      expect(result).toEqual(embedding)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/embeddings'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('throws when Ollama returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
      const { embed } = await import('@/lib/graph/ollama')
      await expect(embed('test')).rejects.toThrow('Ollama embed failed: 500')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/graph/ollama.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the Ollama client**

```ts
// src/lib/graph/ollama.ts
const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434'

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
  })
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`)
  const json = await res.json() as { embedding: number[] }
  return json.embedding
}

export async function checkHealth(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`${OLLAMA_BASE}/`, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/graph/ollama.test.ts`
Expected: 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/ollama.ts src/__tests__/lib/graph/ollama.test.ts
git commit -m "feat: add Ollama HTTP client with embed and checkHealth"
```

---

### Task 3: Content extraction

**Files:**
- Create: `src/lib/graph/content.ts`
- Create: `src/__tests__/lib/graph/content.test.ts`

Background: `Block` (from `@/lib/types/database`) has `content: Record<string, unknown>` which stores a `TiptapNode` as JSONB. `TiptapNode` has optional `text?: string` and `content?: TiptapNode[]`. `pageToText` walks blocks loaded from the DB. `parseMentions` walks `TiptapNode[]` (the `doc.content` array available at save time).

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/graph/content.test.ts
import { describe, it, expect } from 'vitest'
import { pageToText, fileToText, rowToText, parseMentions } from '@/lib/graph/content'
import type { Block, TiptapNode } from '@/lib/types/database'

function makeBlock(node: TiptapNode): Block {
  return { id: 'b1', page_id: 'p1', type: 'text', content: node as unknown as Record<string, unknown>, position: 0, created_at: '' }
}

describe('pageToText', () => {
  it('returns just the title when blocks is empty', () => {
    expect(pageToText('My Page', [])).toBe('My Page')
  })

  it('concatenates title with text from a single block', () => {
    const block = makeBlock({ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] })
    expect(pageToText('Title', [block])).toBe('Title\nHello world')
  })

  it('extracts text from multiple blocks', () => {
    const b1 = makeBlock({ type: 'paragraph', content: [{ type: 'text', text: 'First' }] })
    const b2 = makeBlock({ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] })
    expect(pageToText('T', [b1, b2])).toBe('T\nFirst\nSecond')
  })

  it('extracts text from nested inline nodes', () => {
    const block = makeBlock({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' normal' },
      ],
    })
    expect(pageToText('T', [block])).toBe('T\nBold\n normal')
  })

  it('skips blocks with no text nodes', () => {
    const block = makeBlock({ type: 'image', attrs: { src: 'img.png' } })
    expect(pageToText('Title', [block])).toBe('Title')
  })
})

describe('fileToText', () => {
  it('returns null for null input', () => {
    expect(fileToText(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(fileToText('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(fileToText('   ')).toBeNull()
  })

  it('returns the text unchanged for non-empty input', () => {
    expect(fileToText('extracted content')).toBe('extracted content')
  })
})

describe('rowToText', () => {
  it('returns empty string for empty fields', () => {
    expect(rowToText({})).toBe('')
  })

  it('formats fields as key: value pairs sorted alphabetically by key', () => {
    expect(rowToText({ name: 'Alice', age: 30 })).toBe('age: 30\nname: Alice')
  })

  it('coerces null field values to empty string', () => {
    expect(rowToText({ status: null })).toBe('status: ')
  })

  it('coerces boolean field values', () => {
    expect(rowToText({ done: true })).toBe('done: true')
  })
})

describe('parseMentions', () => {
  it('returns empty array when no [[mentions]] present', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'No mentions here' }] }]
    expect(parseMentions(nodes)).toEqual([])
  })

  it('extracts a single mention', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'See [[Project X]]' }] }]
    expect(parseMentions(nodes)).toEqual(['Project X'])
  })

  it('extracts multiple distinct mentions', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: '[[Page A]] and [[Page B]]' }] }]
    const result = parseMentions(nodes)
    expect(result).toContain('Page A')
    expect(result).toContain('Page B')
    expect(result).toHaveLength(2)
  })

  it('deduplicates repeated mentions', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: '[[Page A]] and [[Page A]]' }] }]
    expect(parseMentions(nodes)).toEqual(['Page A'])
  })

  it('returns empty array for nodes with no text content', () => {
    const nodes: TiptapNode[] = [{ type: 'image', attrs: { src: 'img.png' } }]
    expect(parseMentions(nodes)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/graph/content.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement content extraction**

```ts
// src/lib/graph/content.ts
import type { Block, TiptapNode } from '@/lib/types/database'

export function pageToText(title: string, blocks: Block[]): string {
  const parts: string[] = [title]

  function walkNode(node: TiptapNode) {
    if (node.text) parts.push(node.text)
    for (const child of node.content ?? []) walkNode(child)
  }

  for (const block of blocks) {
    walkNode(block.content as unknown as TiptapNode)
  }

  return parts.join('\n')
}

export function fileToText(extractedText: string | null): string | null {
  if (!extractedText || extractedText.trim() === '') return null
  return extractedText
}

export function rowToText(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .sort()
    .map(key => `${key}: ${String(fields[key] ?? '')}`)
    .join('\n')
}

export function parseMentions(nodes: TiptapNode[]): string[] {
  const mentions = new Set<string>()

  function walkNode(node: TiptapNode) {
    if (node.text) {
      for (const match of node.text.matchAll(/\[\[(.+?)\]\]/g)) {
        mentions.add(match[1])
      }
    }
    for (const child of node.content ?? []) walkNode(child)
  }

  for (const node of nodes) {
    try { walkNode(node) } catch { /* skip malformed node */ }
  }

  return Array.from(mentions)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/graph/content.test.ts`
Expected: 14 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/content.ts src/__tests__/lib/graph/content.test.ts
git commit -m "feat: add content extraction functions for graph embedding"
```

---

### Task 4: Graph server actions

**Files:**
- Create: `src/lib/graph/graph.ts`
- Create: `src/__tests__/lib/graph/graph.test.ts`

Background: These are `'use server'` actions. `upsertNode` uses Supabase's `.upsert()` with `onConflict: 'entity_type,entity_id'` (the unique constraint added in Task 1). `upsertEdge` uses `onConflict: 'source_node_id,target_node_id,relationship_type'` with `ignoreDuplicates: true`. `scheduleEmbed` retries embedding up to 3× with 1s/2s/4s backoff; on total failure it logs and returns without throwing so the node keeps `embedding = null` and the page stays searchable via full-text.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/graph/graph.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── nodes table ──────────────────────────────────────────────────
const mockNodesUpsertSingle = vi.fn()
const mockNodesUpsertSelect = vi.fn(() => ({ single: mockNodesUpsertSingle }))
const mockNodesUpsert = vi.fn(() => ({ select: mockNodesUpsertSelect }))

const mockNodesUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockNodesUpdate = vi.fn(() => ({ eq: mockNodesUpdateEq }))

const mockNodesMaybeSingle = vi.fn()
const mockNodesSelectEq2 = vi.fn(() => ({ maybeSingle: mockNodesMaybeSingle }))
const mockNodesSelectEq1 = vi.fn(() => ({ eq: mockNodesSelectEq2 }))
const mockNodesSelect = vi.fn(() => ({ eq: mockNodesSelectEq1 }))

// ── edges table ──────────────────────────────────────────────────
const mockEdgesUpsert = vi.fn().mockResolvedValue({ error: null })

// ── pages table (for findPageNodeByTitle) ──────────────────────
const mockPagesMaybeSingle = vi.fn()
const mockPagesSelectEq2 = vi.fn(() => ({ maybeSingle: mockPagesMaybeSingle }))
const mockPagesSelectEq1 = vi.fn(() => ({ eq: mockPagesSelectEq2 }))
const mockPagesSelect = vi.fn(() => ({ eq: mockPagesSelectEq1 }))

const mockFrom = vi.fn((table: string) => {
  switch (table) {
    case 'nodes': return { upsert: mockNodesUpsert, update: mockNodesUpdate, select: mockNodesSelect }
    case 'edges': return { upsert: mockEdgesUpsert }
    case 'pages': return { select: mockPagesSelect }
    default: return {}
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })),
}))
vi.mock('@/lib/graph/ollama', () => ({
  embed: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
}))

describe('graph actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockNodesUpsertSingle.mockResolvedValue({ data: { id: 'n1' }, error: null })
    mockNodesUpsertSelect.mockImplementation(() => ({ single: mockNodesUpsertSingle }))
    mockNodesUpsert.mockImplementation(() => ({ select: mockNodesUpsertSelect }))
    mockNodesUpdateEq.mockResolvedValue({ error: null })
    mockNodesUpdate.mockImplementation(() => ({ eq: mockNodesUpdateEq }))
    mockNodesMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockNodesSelectEq2.mockImplementation(() => ({ maybeSingle: mockNodesMaybeSingle }))
    mockNodesSelectEq1.mockImplementation(() => ({ eq: mockNodesSelectEq2 }))
    mockNodesSelect.mockImplementation(() => ({ eq: mockNodesSelectEq1 }))
    mockEdgesUpsert.mockResolvedValue({ error: null })
    mockPagesMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockPagesSelectEq2.mockImplementation(() => ({ maybeSingle: mockPagesMaybeSingle }))
    mockPagesSelectEq1.mockImplementation(() => ({ eq: mockPagesSelectEq2 }))
    mockPagesSelect.mockImplementation(() => ({ eq: mockPagesSelectEq1 }))
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'nodes': return { upsert: mockNodesUpsert, update: mockNodesUpdate, select: mockNodesSelect }
        case 'edges': return { upsert: mockEdgesUpsert }
        case 'pages': return { select: mockPagesSelect }
        default: return {}
      }
    })
  })

  describe('upsertNode', () => {
    it('upserts a node and returns its id', async () => {
      const { upsertNode } = await import('@/lib/graph/graph')
      const id = await upsertNode('ws1', 'page', 'entity1')
      expect(mockNodesUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws1', entity_type: 'page', entity_id: 'entity1' }),
        expect.objectContaining({ onConflict: 'entity_type,entity_id' })
      )
      expect(id).toBe('n1')
    })

    it('throws when supabase returns an error', async () => {
      mockNodesUpsertSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
      const { upsertNode } = await import('@/lib/graph/graph')
      await expect(upsertNode('ws1', 'page', 'e1')).rejects.toThrow('DB error')
    })
  })

  describe('scheduleEmbed', () => {
    it('calls embed and updates node embedding on success', async () => {
      const { embed } = await import('@/lib/graph/ollama')
      const { scheduleEmbed } = await import('@/lib/graph/graph')
      await scheduleEmbed('n1', 'hello world')
      expect(embed).toHaveBeenCalledWith('hello world')
      expect(mockNodesUpdate).toHaveBeenCalledWith(expect.objectContaining({ embedding: expect.any(Array) }))
      expect(mockNodesUpdateEq).toHaveBeenCalledWith('id', 'n1')
    })

    it('retries 3 times then gives up without throwing', async () => {
      vi.useFakeTimers()
      const { embed } = await import('@/lib/graph/ollama')
      vi.mocked(embed).mockRejectedValue(new Error('Ollama down'))
      const { scheduleEmbed } = await import('@/lib/graph/graph')
      const p = scheduleEmbed('n1', 'text')
      await vi.runAllTimersAsync()
      await p
      expect(embed).toHaveBeenCalledTimes(3)
      expect(mockNodesUpdateEq).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('upsertEdge', () => {
    it('upserts an edge with ignoreDuplicates', async () => {
      const { upsertEdge } = await import('@/lib/graph/graph')
      await upsertEdge('ws1', 'n-source', 'n-target', 'parent_child')
      expect(mockEdgesUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws1',
          source_node_id: 'n-source',
          target_node_id: 'n-target',
          relationship_type: 'parent_child',
        }),
        expect.objectContaining({ ignoreDuplicates: true })
      )
    })
  })

  describe('findNodeId', () => {
    it('returns null when node not found', async () => {
      mockNodesMaybeSingle.mockResolvedValue({ data: null, error: null })
      const { findNodeId } = await import('@/lib/graph/graph')
      expect(await findNodeId('page', 'e1')).toBeNull()
    })

    it('returns the node id when found', async () => {
      mockNodesMaybeSingle.mockResolvedValue({ data: { id: 'n42' }, error: null })
      const { findNodeId } = await import('@/lib/graph/graph')
      expect(await findNodeId('page', 'e1')).toBe('n42')
    })
  })

  describe('findPageNodeByTitle', () => {
    it('returns null when no page with that title exists', async () => {
      mockPagesMaybeSingle.mockResolvedValue({ data: null, error: null })
      const { findPageNodeByTitle } = await import('@/lib/graph/graph')
      expect(await findPageNodeByTitle('ws1', 'Missing Page')).toBeNull()
    })

    it('returns the node id when page and node both exist', async () => {
      mockPagesMaybeSingle.mockResolvedValue({ data: { id: 'p99' }, error: null })
      mockNodesMaybeSingle.mockResolvedValue({ data: { id: 'n99' }, error: null })
      const { findPageNodeByTitle } = await import('@/lib/graph/graph')
      expect(await findPageNodeByTitle('ws1', 'My Page')).toBe('n99')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/graph/graph.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement graph server actions**

```ts
// src/lib/graph/graph.ts
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
  return data.id as string
}

export async function scheduleEmbed(nodeId: string, text: string): Promise<void> {
  const supabase = await createClient()
  const delays = [1000, 2000, 4000]
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const embedding = await embed(text)
      await supabase
        .from('nodes')
        .update({ embedding, updated_at: new Date().toISOString() })
        .eq('id', nodeId)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/graph/graph.test.ts`
Expected: 8 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/graph.ts src/__tests__/lib/graph/graph.test.ts
git commit -m "feat: add graph server actions (upsertNode, scheduleEmbed, upsertEdge, findNodeId)"
```

---

### Task 5: OllamaStatusBanner component

**Files:**
- Create: `src/components/layout/OllamaStatusBanner.tsx`
- Create: `src/__tests__/components/layout/OllamaStatusBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/components/layout/OllamaStatusBanner.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OllamaStatusBanner } from '@/components/layout/OllamaStatusBanner'

describe('OllamaStatusBanner', () => {
  it('renders the banner when ollamaAvailable is false', () => {
    render(<OllamaStatusBanner ollamaAvailable={false} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/AI features unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/ollama serve/i)).toBeInTheDocument()
  })

  it('does not render when ollamaAvailable is true', () => {
    render(<OllamaStatusBanner ollamaAvailable={true} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('dismiss button removes the banner', async () => {
    render(<OllamaStatusBanner ollamaAvailable={false} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/layout/OllamaStatusBanner.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

```tsx
// src/components/layout/OllamaStatusBanner.tsx
'use client'

import { useState } from 'react'

interface OllamaStatusBannerProps {
  ollamaAvailable: boolean
}

export function OllamaStatusBanner({ ollamaAvailable }: OllamaStatusBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (ollamaAvailable || dismissed) return null

  return (
    <div role="alert" className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between text-sm text-yellow-800">
      <span>
        AI features unavailable — Ollama is not running. Start it with{' '}
        <code className="font-mono bg-yellow-100 px-1 rounded">ollama serve</code>.
      </span>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="ml-4 text-yellow-600 hover:text-yellow-800 font-medium"
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/layout/OllamaStatusBanner.test.tsx`
Expected: 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/OllamaStatusBanner.tsx src/__tests__/components/layout/OllamaStatusBanner.test.tsx
git commit -m "feat: add OllamaStatusBanner component shown when Ollama is unreachable"
```

---

### Task 6: Wire health check into layout and AppShell

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/AppShell.tsx`

Note: `layout.tsx` is an async server component, not unit tested. `AppShell.tsx` is a client component wrapper. Run the full test suite after to verify no regressions.

- [ ] **Step 1: Update AppShell to accept and render the banner**

Replace the entire contents of `src/components/layout/AppShell.tsx`:

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

- [ ] **Step 2: Update layout.tsx to call checkHealth and pass result**

Replace the entire contents of `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { checkHealth } from '@/lib/graph/ollama'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id) as { data: WorkspaceEntry[] | null }

  const workspaceIds = (workspaces ?? []).map(w => w.workspace_id)
  const pages: Page[] = workspaceIds.length > 0
    ? (await supabase
        .from('pages')
        .select('*')
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: true })
      ).data ?? []
    : []

  const pageIds = pages.map(p => p.id)
  const databases: Database[] = pageIds.length > 0
    ? (await supabase
        .from('databases')
        .select('id, page_id, schema, created_at')
        .in('page_id', pageIds)
      ).data ?? []
    : []

  const ollamaAvailable = await checkHealth()

  return (
    <AppShell workspaces={workspaces ?? []} user={user} pages={pages} databases={databases} ollamaAvailable={ollamaAvailable}>
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 3: Run the full test suite to verify no regressions**

Run: `npx vitest run`
Expected: all existing tests pass (currently 73)

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/layout.tsx src/components/layout/AppShell.tsx
git commit -m "feat: add Ollama health check to app layout and status banner to AppShell"
```

---

### Task 7: Wire graph into pages.ts and update PageEditor

**Files:**
- Modify: `src/lib/actions/pages.ts`
- Modify: `src/components/editor/PageEditor.tsx`
- Modify: `src/__tests__/lib/actions/pages.test.ts`

Background: `saveBlocks` needs a `pageTitle` parameter to build the embedding text (title + block content). `createPage` and `updatePageTitle` get `after()` hooks to upsert nodes. `saveBlocks` gets an `after()` hook to upsert the page node, parse `[[mentions]]`, create edges, and schedule embedding. The existing pages test file needs mocks for `next/server` and `@/lib/graph/*`.

- [ ] **Step 1: Update pages.test.ts to add required mocks**

Add these mock declarations at the top of `src/__tests__/lib/actions/pages.test.ts`, before the existing mocks:

```ts
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/graph/graph', () => ({
  upsertNode: vi.fn().mockResolvedValue('n1'),
  scheduleEmbed: vi.fn().mockResolvedValue(undefined),
  upsertEdge: vi.fn().mockResolvedValue(undefined),
  findNodeId: vi.fn().mockResolvedValue(null),
  findPageNodeByTitle: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/graph/content', () => ({
  pageToText: vi.fn().mockReturnValue('page text'),
  parseMentions: vi.fn().mockReturnValue([]),
}))
```

Also add `vi.mock('next/cache', ...)` is already present — keep it.

- [ ] **Step 2: Run the existing pages tests to confirm they still pass with new mocks**

Run: `npx vitest run src/__tests__/lib/actions/pages.test.ts`
Expected: 4 tests passed (same as before)

- [ ] **Step 3: Replace pages.ts with the updated version**

Replace the entire contents of `src/lib/actions/pages.ts`:

```ts
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
```

- [ ] **Step 4: Update PageEditor.tsx to pass title to saveBlocks**

In `src/components/editor/PageEditor.tsx`, update the `handleSave` function:

```tsx
function handleSave(doc: TiptapDocument) {
  startTransition(async () => {
    try {
      await saveBlocks(pageId, workspaceId, doc, title)
      setSaveError(null)
    } catch {
      setSaveError('Failed to save content')
    }
  })
}
```

(Only the `saveBlocks` call changes — add `, title` as the fourth argument.)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/pages.ts src/components/editor/PageEditor.tsx src/__tests__/lib/actions/pages.test.ts
git commit -m "feat: wire knowledge graph node/edge upserts into page create and block save"
```

---

### Task 8: Wire graph into files.ts

**Files:**
- Modify: `src/lib/actions/files.ts`

Background: `runExtraction` is a private function called inside `after()` from `createFilePage`, and called directly from `retryExtraction`. We add `workspaceId` as a new parameter to `runExtraction` so it can upsert the file node and schedule embedding after successful text extraction. The `createFilePage` caller and `retryExtraction` both have `workspaceId` available. Since `runExtraction` is only called from within `after()` callbacks or `retryExtraction` (not unit tested), no test changes are required.

- [ ] **Step 1: Add graph imports to files.ts**

At the top of `src/lib/actions/files.ts`, after the existing imports, add:

```ts
import { upsertNode, scheduleEmbed } from '@/lib/graph/graph'
import { fileToText } from '@/lib/graph/content'
```

- [ ] **Step 2: Update runExtraction to accept workspaceId and schedule embedding**

Replace the `runExtraction` function:

```ts
async function runExtraction(fileId: string, storagePath: string, mimeType: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  try {
    const { data: blob, error } = await supabase.storage.from('files').download(storagePath)
    if (error || !blob) throw new Error(error?.message ?? 'Download failed')

    const buffer = Buffer.from(await blob.arrayBuffer())
    let text: string | null = null

    if (mimeType === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      text = result.text
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      text = buffer.toString('utf-8')
    }

    await supabase
      .from('files')
      .update({ extracted_text: text, extraction_status: 'done' })
      .eq('id', fileId)

    const embeddableText = fileToText(text)
    if (embeddableText) {
      const nodeId = await upsertNode(workspaceId, 'file', fileId)
      await scheduleEmbed(nodeId, embeddableText)
    }
  } catch {
    await supabase
      .from('files')
      .update({ extraction_status: 'error' })
      .eq('id', fileId)
  }
}
```

- [ ] **Step 3: Update the two callers of runExtraction to pass workspaceId**

In `createFilePage`, update the `after()` call:

```ts
if (extractionStatus === 'pending') {
  after(() => runExtraction(fileData.id, storagePath, mimeType, workspaceId))
}
```

In `retryExtraction`, update the direct call:

```ts
await runExtraction(fileId, (file as FileRecord).storage_path, (file as FileRecord).mime_type, workspaceId)
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/files.ts
git commit -m "feat: upsert file node and schedule embedding after successful text extraction"
```

---

### Task 9: Wire graph into databases.ts

**Files:**
- Modify: `src/lib/actions/databases.ts`
- Modify: `src/__tests__/lib/actions/databases.test.ts`

Background: `createRow` and `updateRowFields` get `after()` hooks that upsert the database_row node and schedule embedding. The existing databases test needs mocks for `next/server` and `@/lib/graph/*` to prevent the callbacks from executing.

- [ ] **Step 1: Add mocks to databases.test.ts**

Add these mock declarations at the top of `src/__tests__/lib/actions/databases.test.ts`, before the existing mocks:

```ts
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/graph/graph', () => ({
  upsertNode: vi.fn().mockResolvedValue('n1'),
  scheduleEmbed: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/graph/content', () => ({
  rowToText: vi.fn().mockReturnValue('field text'),
}))
```

- [ ] **Step 2: Run the existing databases tests to confirm they still pass**

Run: `npx vitest run src/__tests__/lib/actions/databases.test.ts`
Expected: 10 tests passed

- [ ] **Step 3: Add imports and after() hooks to databases.ts**

At the top of `src/lib/actions/databases.ts`, after the existing imports, add:

```ts
import { after } from 'next/server'
import { upsertNode, scheduleEmbed } from '@/lib/graph/graph'
import { rowToText } from '@/lib/graph/content'
```

In `createRow`, add the `after()` hook immediately before the final `revalidatePath` call:

```ts
  after(async () => {
    const nodeId = await upsertNode(workspaceId, 'database_row', row.id)
    await scheduleEmbed(nodeId, rowToText(row.fields as Record<string, unknown>))
  })

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
```

In `updateRowFields`, add the `after()` hook immediately before the final `revalidatePath` call:

```ts
  after(async () => {
    const nodeId = await upsertNode(workspaceId, 'database_row', rowId)
    await scheduleEmbed(nodeId, rowToText(fields))
  })

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/databases.ts src/__tests__/lib/actions/databases.test.ts
git commit -m "feat: upsert database row nodes and schedule embedding on create and update"
```

---

## Final verification

After all 9 tasks are complete:

- [ ] Run `npx tsc --noEmit` — expected: no errors
- [ ] Run `npx vitest run` — expected: all tests pass (73 + new graph/banner tests)
- [ ] Confirm the test count grew by the new graph tests (ollama: 5, content: 14, graph: 8, banner: 3 = 30 new tests)
