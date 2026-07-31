# Phase 3: Knowledge Graph — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically populate the `nodes` and `edges` tables as content is created and edited, generate semantic embeddings via Ollama, and surface an Ollama health banner when AI features are unavailable.

**Architecture:** Three new modules under `src/lib/graph/` handle the Ollama client, content extraction, and server actions. Embedding is triggered asynchronously via `next/server`'s `after()` — the same pattern used by file extraction — so page saves never block on Ollama. Edges (parent_child, mention, backlink) are created at the same trigger points as node upserts.

**Tech Stack:** Next.js `after()`, Supabase Postgres + pgvector, Ollama (`nomic-embed-text`, 768 dimensions), Vitest

---

## Scope

Phase 3 covers:
- Node upsert for pages, files, and database rows
- Embedding generation via Ollama with 3× retry and graceful degradation
- Edge creation: `parent_child` on page create, `mention`/`backlink` parsed from Tiptap block JSON
- Ollama health check on every app layout render
- Yellow dismissible banner in the app shell when Ollama is unreachable
- New migration: unique constraint on `nodes(entity_type, entity_id)`

Phase 3 does **not** cover:
- Semantic search or Q&A (Phase 4)
- Block-level nodes (page granularity only)
- @mention UI in the editor (mentions are parsed from existing `[[page title]]` text patterns in block content)
- Manual edge creation

---

## Data Model

### Existing tables (unchanged structure)

```sql
nodes (
  id uuid primary key,
  workspace_id uuid not null,
  entity_type text not null check (entity_type in ('page', 'block', 'file', 'database_row')),
  entity_id uuid not null,
  embedding vector(768),          -- null until Ollama embeds it
  created_at timestamptz,
  updated_at timestamptz
)

edges (
  id uuid primary key,
  workspace_id uuid not null,
  source_node_id uuid not null references nodes(id) on delete cascade,
  target_node_id uuid not null references nodes(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('mention', 'backlink', 'parent_child', 'manual')),
  created_at timestamptz
)
```

### New migration

`supabase/migrations/20260731000002_nodes_unique_constraint.sql`:
```sql
ALTER TABLE nodes
  ADD CONSTRAINT nodes_entity_unique UNIQUE (entity_type, entity_id);
```

This enables safe upsert via `ON CONFLICT (entity_type, entity_id) DO UPDATE`.

---

## Node Embedding Content

One node per entity. Content used to generate the embedding:

| `entity_type`  | Content string |
|---|---|
| `page`         | `title + "\n" + blocks text (block.content text nodes joined by "\n")` |
| `file`         | `files.extracted_text` — skipped (embedding stays null) if null |
| `database_row` | `"key: value\n"` pairs from `fields` JSONB, sorted by key |

---

## Trigger Points

All triggers use `after()` from `next/server` so the HTTP response is never delayed.

| Action | Node upserted | Edges created |
|---|---|---|
| `createPage` | page node | `parent_child` edge if `parent_id` set |
| `updatePageTitle` | page node (loads current blocks inside `after()` for full text) | — |
| `saveBlocks` | page node | `mention` + `backlink` edges from `[[...]]` parsing |
| `runExtraction` completes (in `files.ts`) | file node | — |
| `createRow` / `updateRow` (in `databases.ts`) | database_row node | — |

---

## New Modules

### `src/lib/graph/ollama.ts`

Thin HTTP client — no SDK.

```ts
const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434'

// Returns embedding array (768 floats) for the given text.
// Throws on network error or non-200 response.
export async function embed(text: string): Promise<number[]>
// POST ${OLLAMA_BASE}/api/embeddings
// body: { model: 'nomic-embed-text', prompt: text }
// returns response.embedding

// Returns true if Ollama is reachable, false on any error.
// Uses a 2-second AbortController timeout.
export async function checkHealth(): Promise<boolean>
// GET ${OLLAMA_BASE}/  → true if status 200, false otherwise
```

### `src/lib/graph/content.ts`

Pure functions — no I/O, fully unit-testable.

```ts
import type { Block } from '@/lib/types/database'

// Concatenates page title and all block text content.
export function pageToText(title: string, blocks: Block[]): string

// Returns extracted_text, or null if empty/null (caller skips embedding).
export function fileToText(extractedText: string | null): string | null

// Joins JSONB fields as "key: value\n" pairs, sorted by key.
export function rowToText(fields: Record<string, unknown>): string

// Scans block content JSONB for text nodes matching /\[\[(.+?)\]\]/g.
// Returns array of matched page titles (deduplicated).
export function parseMentions(blocks: Block[]): string[]
```

**`pageToText` detail:** Walks `block.content` (Tiptap JSONB). For each block, extracts the `text` string from leaf nodes (type: `text`). Joins all block texts with `"\n"`, prepends `title + "\n"`.

**`parseMentions` detail:** Searches all text leaf nodes across all blocks for the pattern `[[page title]]`. Returns unique title strings. Empty blocks and non-text nodes are skipped.

### `src/lib/graph/graph.ts`

Server actions (`'use server'`). Uses `createClient()` from `@/lib/supabase/server`.

```ts
// Upserts a node for the given entity. Returns the node id.
// Uses ON CONFLICT (entity_type, entity_id) DO UPDATE SET updated_at = now()
export async function upsertNode(
  workspaceId: string,
  entityType: 'page' | 'file' | 'database_row',
  entityId: string
): Promise<string>

// Generates and stores an embedding for the given node.
// Retries up to 3× with 1s/2s/4s backoff on Ollama failure.
// On permanent failure: logs to console, returns without throwing (node keeps embedding=null).
// Called exclusively inside after() callbacks — never awaited on the request path.
export async function scheduleEmbed(nodeId: string, text: string): Promise<void>

// Inserts an edge. ON CONFLICT DO NOTHING (idempotent).
export async function upsertEdge(
  workspaceId: string,
  sourceNodeId: string,
  targetNodeId: string,
  relationshipType: 'parent_child' | 'mention' | 'backlink'
): Promise<void>

// Looks up node id for a given entity. Returns null if not found.
export async function findNodeId(
  entityType: 'page' | 'file' | 'database_row',
  entityId: string
): Promise<string | null>

// Looks up a page node id by page title within a workspace.
// Used by mention parsing to resolve [[page title]] → node id.
// Returns null if no page with that title exists.
export async function findPageNodeByTitle(
  workspaceId: string,
  title: string
): Promise<string | null>
```

---

## Modified Files

### `src/lib/actions/pages.ts`

Add `after()` hooks in `createPage` and `saveBlocks`:

**`createPage`** — after inserting the page row:
```ts
after(async () => {
  const nodeId = await upsertNode(workspaceId, 'page', pageId)
  if (parentId) {
    const parentNodeId = await findNodeId('page', parentId)
    if (parentNodeId) await upsertEdge(workspaceId, parentNodeId, nodeId, 'parent_child')
  }
  await scheduleEmbed(nodeId, pageToText(title, []))
})
```

**`updatePageTitle`** — after updating the title, loads current blocks from DB inside `after()` to build accurate embedding text:
```ts
after(async () => {
  const supabase = await createClient()
  const { data: blocks } = await supabase.from('blocks').select('*').eq('page_id', pageId).order('position')
  const nodeId = await upsertNode(workspaceId, 'page', pageId)
  await scheduleEmbed(nodeId, pageToText(title, blocks ?? []))
})
```

**`saveBlocks`** — after saving blocks:
```ts
after(async () => {
  const nodeId = await upsertNode(workspaceId, 'page', pageId)
  const text = pageToText(pageTitle, blocks)
  // Parse [[mentions]] and create edges
  const mentionedTitles = parseMentions(blocks)
  for (const title of mentionedTitles) {
    const targetNodeId = await findPageNodeByTitle(workspaceId, title)
    if (targetNodeId) {
      await upsertEdge(workspaceId, nodeId, targetNodeId, 'mention')
      await upsertEdge(workspaceId, targetNodeId, nodeId, 'backlink')
    }
  }
  await scheduleEmbed(nodeId, text)
})
```

`saveBlocks` needs the current page title to build the embedding text. Add `pageTitle: string` as a parameter to `saveBlocks` and pass it from `PageEditor`.

### `src/lib/actions/files.ts`

In `runExtraction`, after a successful update to `extraction_status: 'done'`:
```ts
const text = fileToText(extractedText)
if (text) {
  const nodeId = await upsertNode(workspaceId, 'file', fileId)
  await scheduleEmbed(nodeId, text)
}
```

`runExtraction` needs `workspaceId` passed through. Add it as a parameter; update `createFilePage` caller.

### `src/lib/actions/databases.ts`

After `createRow` and `updateRow` inserts/updates:
```ts
after(async () => {
  const nodeId = await upsertNode(workspaceId, 'database_row', rowId)
  await scheduleEmbed(nodeId, rowToText(fields))
})
```

### `src/app/(app)/layout.tsx`

Add health check before rendering:
```ts
import { checkHealth } from '@/lib/graph/ollama'

const ollamaAvailable = await checkHealth()
// pass to AppShell
```

### `src/components/layout/AppShell.tsx`

Add `ollamaAvailable?: boolean` prop (default: `true`). Render `<OllamaStatusBanner />` when `false`.

---

## New Component: `OllamaStatusBanner`

`src/components/layout/OllamaStatusBanner.tsx` — `'use client'`

- Yellow banner pinned below the top of the workspace layout
- Message: *"AI features unavailable — Ollama is not running. Start it with `ollama serve`."*
- Dismiss button (`×`) sets local `dismissed` state; banner unmounts
- Rendered only when `ollamaAvailable={false}` prop is passed to `AppShell`

---

## Error Handling

| Scenario | Handling |
|---|---|
| Ollama unreachable on embed | Retry 3× (1s/2s/4s backoff); node keeps `embedding = null`; console.error logged |
| Ollama unreachable on health check | `checkHealth()` returns `false`; banner shown; app fully functional |
| `findPageNodeByTitle` returns null | Mention edge silently skipped (target page may not exist yet) |
| `upsertNode` DB error | Throws; `after()` callback logs error; no user impact |
| `parseMentions` on malformed JSONB | Try/catch in parseMentions returns `[]`; embedding still proceeds |

---

## Testing

### Unit tests (Vitest)

**`src/__tests__/lib/graph/content.test.ts`**
- `pageToText`: empty blocks, multiple blocks, marks stripped, title prepended
- `fileToText`: null input returns null, non-null returns string
- `rowToText`: fields sorted, coerces non-string values
- `parseMentions`: no mentions, single mention, multiple mentions, duplicates deduplicated, nested content

**`src/__tests__/lib/graph/graph.test.ts`**
- `upsertNode`: calls correct Supabase upsert, returns node id
- `scheduleEmbed`: calls `embed()`, updates node; retries on failure; stops after 3 failures
- `upsertEdge`: inserts with ON CONFLICT DO NOTHING
- `findPageNodeByTitle`: returns null when not found, returns id when found

**`src/__tests__/components/layout/OllamaStatusBanner.test.tsx`**
- Renders banner when `ollamaAvailable={false}`
- Does not render when `ollamaAvailable={true}`
- Dismiss button removes banner from DOM

### Mocks

```ts
// In all graph tests:
vi.mock('@/lib/graph/ollama', () => ({
  embed: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
  checkHealth: vi.fn().mockResolvedValue(true),
}))
```

### Not covered (deferred to E2E / Phase 4)
- Real Ollama round-trips
- pgvector similarity query results
- End-to-end: save page → node upserted → embedding stored

---

## File Summary

| File | Action |
|---|---|
| `supabase/migrations/20260731000002_nodes_unique_constraint.sql` | Create |
| `src/lib/graph/ollama.ts` | Create |
| `src/lib/graph/content.ts` | Create |
| `src/lib/graph/graph.ts` | Create |
| `src/components/layout/OllamaStatusBanner.tsx` | Create |
| `src/lib/actions/pages.ts` | Modify |
| `src/lib/actions/files.ts` | Modify |
| `src/lib/actions/databases.ts` | Modify |
| `src/app/(app)/layout.tsx` | Modify |
| `src/components/layout/AppShell.tsx` | Modify |
| `src/__tests__/lib/graph/content.test.ts` | Create |
| `src/__tests__/lib/graph/graph.test.ts` | Create |
| `src/__tests__/components/layout/OllamaStatusBanner.test.tsx` | Create |
