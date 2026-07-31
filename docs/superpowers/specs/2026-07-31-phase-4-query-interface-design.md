# Phase 4: Query Interface (Cmd+K) — Design Spec
**Date:** 2026-07-31

## Overview

Phase 4 adds a global `Cmd+K` query modal with two modes:

- **Search** — semantic similarity search across all workspace content, results grouped by project
- **Ask** — streamed AI Q&A backed by Graph RAG (vector search + 1-hop graph traversal), with source citations

Every database is a "project." The system automatically discovers cross-project connections at query time via pgvector — no pre-computed similarity edges needed.

---

## Architecture

**Approach:** Server Action for Search, Route Handler for streaming Ask.

No new DB migrations — `nodes`, `edges`, and `query_logs` tables already exist from Phase 3.

### New Files

| File | Responsibility |
|---|---|
| `src/lib/graph/query.ts` | Core retrieval: embed query → pgvector top-10 → 1-hop graph expansion → fetch source content → return `SearchResult[]` |
| `src/lib/actions/query.ts` | Server Action wrapping retrieval for Search mode; falls back to ILIKE on Ollama failure |
| `src/app/api/query/ask/route.ts` | Route Handler: retrieval → prompt assembly → stream Ollama tokens → log to `query_logs` |
| `src/components/query/CmdKModal.tsx` | Global overlay modal — Cmd+K listener, input, mode toggle, scope selector |
| `src/components/query/SearchResults.tsx` | Renders `SearchResult[]` grouped by project with title + excerpt + navigation links |
| `src/components/query/AskPanel.tsx` | Streams tokens into UI, renders source citations below response |

### Modified Files

| File | Change |
|---|---|
| `src/components/layout/AppShell.tsx` | Global `keydown` listener for `Cmd+K` / `Ctrl+K`; renders `CmdKModal` |
| `src/lib/graph/ollama.ts` | Add `streamChat(prompt: string): AsyncGenerator<string>` |
| `src/lib/types/database.ts` | Add `SearchResult` type |

---

## Data Model Additions

### `SearchResult` type (TypeScript only, no migration)

```ts
export interface SearchResult {
  nodeId: string
  entityType: EntityType
  entityId: string
  title: string
  excerpt: string
  projectName: string | null      // database page title; null for standalone pages/files
  projectDatabaseId: string | null
  score: number                   // cosine similarity score (0–1)
}
```

---

## Data Flows

### Search Mode

1. User opens modal (`Cmd+K`), types query — debounced 300ms
2. Client calls `searchQuery(workspaceId, query, scope?)` Server Action
3. `query.ts` runs retrieval:
   - Embed query via existing `embed()` from `ollama.ts`
   - pgvector cosine similarity: `SELECT id, entity_type, entity_id FROM nodes WHERE workspace_id = $1 ORDER BY embedding <=> $2 LIMIT 10`
   - Optional scope filter: if `scope.databaseId` set, restrict to nodes whose `entity_id` is in that database's rows/pages
   - 1-hop expansion: fetch edges where `source_node_id OR target_node_id IN (top-10 node ids)` → collect connected node IDs → fetch those nodes
   - Deduplicate; fetch source content (join to `pages`, `files`, `database_rows`)
   - Resolve project name: `database_rows.database_id → databases.page_id → pages.title`
   - Return `SearchResult[]`
4. If Ollama unavailable, fall back to `ILIKE` search on `pages.title` and block content text
5. Results rendered grouped by project (database name as section header)

### Ask Mode

1. User switches to Ask tab, submits question (Enter)
2. Client: `fetch('/api/query/ask', { method: 'POST', body: JSON.stringify({ workspaceId, query, scope }) })`
3. Route Handler:
   - Auth check via Supabase server client → `401` if unauthenticated
   - Scope validation: verify `scope.databaseId` (if set) belongs to `workspaceId` → `403` if mismatch
   - Run same retrieval as Search → `sources: SearchResult[]`
   - Assemble prompt:
     ```
     You are a knowledge assistant. Answer using ONLY the context below.
     Cite sources by their title. If the answer is not in the context, say so clearly.

     Context:
     [source content from retrieved nodes, prefixed with title and project]

     Question: [user query]
     ```
   - Set `X-Sources` response header to `JSON.stringify(sources)`
   - Stream Ollama `/api/generate` (model: `llama3.1:8b`, `stream: true`) via `ReadableStream`
   - After stream closes: insert into `query_logs` (`workspaceId`, `userId`, `query`, full response text, `sources` as JSONB)
4. Client reads stream with `response.body.getReader()`; appends tokens to state
5. Sources rendered below response as `[Title] (Project Name)` links

### Cross-Project Discovery

All nodes across all databases in a workspace share the same `nodes` table, filtered only by `workspace_id`. A single pgvector query therefore spans all projects simultaneously. The 1-hop graph expansion then pulls in structurally connected nodes (parent pages, child rows, mentions) even if their text isn't close to the query. Source content resolution maps each result back to its database (project name), enabling the response to say "Graph RAG was implemented in 4 projects: X, Y, Z, W."

No pre-computed similarity edges are created. Cross-project discovery happens entirely at query time.

---

## Streaming Implementation

`ollama.ts` addition:

```ts
export async function* streamChat(prompt: string): AsyncGenerator<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
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

Route Handler pipes the generator into a `ReadableStream`:

```ts
const stream = new ReadableStream({
  async start(controller) {
    let fullResponse = ''
    for await (const token of streamChat(prompt)) {
      controller.enqueue(new TextEncoder().encode(token))
      fullResponse += token
    }
    await logQuery(workspaceId, userId, query, fullResponse, sources)
    controller.close()
  },
})
return new Response(stream, {
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Sources': JSON.stringify(sources),
  },
})
```

---

## UI / Modal

`CmdKModal` is rendered inside `AppShell` and hidden by default (`open` state).

```
┌─────────────────────────────────────────┐
│ [🔍 Search or ask anything...]   [Esc] │
│ ─────────────────────────────────────── │
│ [Search]  [Ask]          Scope: [All ▾] │
│ ─────────────────────────────────────── │
│                                         │
│  Results / streaming response here      │
│                                         │
└─────────────────────────────────────────┘
```

- Fixed overlay: `fixed inset-0 bg-black/40 z-50`, modal centered `max-w-2xl`
- Input auto-focuses on open; `Escape` closes; click outside closes
- **Search tab:** results appear as user types (300ms debounce), grouped by project with database name as section header; each result shows title + excerpt; clicking navigates to the entity's page and closes modal
- **Ask tab:** Enter submits; spinner while retrieving + streaming; tokens appended to text area; sources list rendered below as `[Title] (Project Name)` links
- **Scope dropdown:** "Entire workspace" (default) + one entry per database in workspace; pre-selected to `currentDatabaseId` if user opened modal from a database page
- `AppShell` already receives `databases` prop — passes them as scope options; gains optional `currentDatabaseId?: string` prop (set by database page layout)

---

## Error Handling

| Scenario | Handling |
|---|---|
| Ollama down (Search) | `embed()` throws → fallback to `ILIKE` on `pages.title` + block text; results marked "(text search)" |
| Ollama down (Ask) | Route Handler catches before stream starts → `503` response → client shows "AI unavailable — start Ollama with `ollama serve`" |
| Ollama hangs mid-stream | 30s `AbortController` timeout → stream closes early → client shows partial response + "Response cut short — Ollama timed out" |
| No embeddings yet (empty results) | 0 nodes returned → modal shows "No results yet — content is still being indexed" |
| `query_logs` write fails | Console error only — query response already delivered to user |
| Unauthenticated request to `/api/query/ask` | Supabase server client → `401` before any retrieval |
| Scope database not in workspace | Validate `database_id` membership → `403` if mismatch |

---

## Testing

| Test | File |
|---|---|
| `retrieveNodes` returns top-10 + 1-hop expansion (mock Supabase) | `src/__tests__/lib/graph/query.test.ts` |
| `retrieveNodes` with `databaseId` scope filter | same |
| `retrieveNodes` when `embed()` throws — propagates error | same |
| `searchQuery` action returns `SearchResult[]` | `src/__tests__/lib/actions/query.test.ts` |
| `searchQuery` action falls back to ILIKE on Ollama error | same |
| `/api/query/ask` — no session → 401 | `src/__tests__/app/api/query/ask.test.ts` |
| `/api/query/ask` — streams tokens, sets `X-Sources` header | same |
| `/api/query/ask` — logs to `query_logs` after stream | same |
| `CmdKModal` opens on `Cmd+K`, closes on `Escape` | `src/__tests__/components/query/CmdKModal.test.tsx` |
| `streamChat` yields tokens from NDJSON mock | `src/__tests__/lib/graph/ollama.test.ts` |
