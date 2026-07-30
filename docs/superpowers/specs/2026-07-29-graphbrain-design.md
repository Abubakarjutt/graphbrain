# Graphbrain — Design Spec
**Date:** 2026-07-29

## Overview

Graphbrain is a Notion-like webapp with a knowledge graph engine that lets users query anything about their workspace or a specific project using natural language search, graph traversal, and AI-powered Q&A — all backed by a self-hosted Ollama AI layer.

---

## Users & Workspaces

- **Target users:** Individuals and small teams
- Personal workspaces (single user) and team workspaces (shared, role-based)
- Workspace roles: Owner, Editor, Viewer
- Auth via Supabase (email/password + magic link)
- Row-level security (RLS) enforces workspace isolation at the database level

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + TailwindCSS + shadcn/ui |
| Backend / DB | Supabase (Postgres + pgvector + Auth + Storage + Realtime) |
| AI — Embeddings | Ollama (`nomic-embed-text`, 768 dimensions) |
| AI — Q&A | Ollama (`llama3.1:8b` or `mistral:7b`, streamed) |
| Knowledge Graph | `nodes` + `edges` tables in Postgres |

---

## Core Components

### 1. Pages & Blocks
- Block-based rich text editor (Tiptap/ProseMirror)
- Block types: text, heading, bullet, numbered list, code, image, file, embed
- Pages nested in a sidebar tree (draggable, collapsible)
- Page content stored as JSONB

### 2. Databases
- Special page type with Table, Kanban, and Calendar views
- Schema stored as JSONB; rows stored in `database_rows` with JSONB fields

### 3. File Attachments
- Images, PDFs, and files uploaded into pages
- Stored in Supabase Storage (S3-compatible)
- PDFs have text extracted async and embedded into the knowledge graph

### 4. Knowledge Graph (Behind the Scenes)
- Every page, block, database row, and file is a **node**
- Relationships (backlinks, @mentions, `[[links]]`, parent/child) are **edges**
- Edges created automatically on content save; manual links also supported
- Nodes hold a `vector(768)` embedding — updated async via Ollama on content change

### 5. Query Interface (`Cmd+K`)
- Two modes:
  - **Search** — instant fuzzy + semantic similarity search across all content
  - **Ask** — natural language Q&A with streamed response + source citations
- Scope selector: "All workspaces" vs "This project only"
- Every AI response shows source citations for user verification

---

## Data Model

```sql
-- Core
workspaces        (id, name, owner_id, created_at)
workspace_members (workspace_id, user_id, role)
pages             (id, workspace_id, parent_id, title, content JSONB, created_by)
blocks            (id, page_id, type, content JSONB, position)
files             (id, workspace_id, page_id, storage_path, mime_type, extracted_text)
databases         (id, page_id, schema JSONB)
database_rows     (id, database_id, fields JSONB)

-- Knowledge graph
nodes             (id, workspace_id, entity_type, entity_id, embedding vector(768))
edges             (id, workspace_id, source_node_id, target_node_id, relationship_type, created_at)

-- Querying
query_logs        (id, workspace_id, user_id, query, response, sources JSONB, created_at)
```

- pgvector indexes `nodes.embedding` for fast approximate nearest-neighbour (ANN) search
- All tables have RLS policies scoped to `workspace_id`
- `edges` table is append-only; `relationship_type` values: `mention`, `backlink`, `parent_child`, `manual`

---

## Data Flows

### Write Flow (content created/edited)
1. User edits page → content saved to `pages`/`blocks` tables
2. Background job triggered (async queue via BullMQ + Redis)
3. Content chunked into passages
4. Each chunk embedded via Ollama (`nomic-embed-text`) → vector stored in `nodes`
5. @mentions and `[[links]]` parsed → edges created/updated in `edges`

### Query Flow (user asks a question)
1. User submits query via `Cmd+K`
2. Query embedded via Ollama (`nomic-embed-text`)
3. pgvector cosine similarity search → top 10 relevant nodes retrieved (filtered by workspace/project scope)
4. Node content fetched from source tables
5. Prompt assembled: system prompt + retrieved context + user question
6. Sent to Ollama (`llama3.1:8b`) → response streamed token by token to UI
7. Source citations extracted and displayed below response
8. Query logged to `query_logs`

### Background Embedding Queue
- BullMQ + Redis for async job management
- Jobs are idempotent (safe to retry)
- Retried up to 3x with exponential backoff on failure
- Pages remain full-text searchable even before embedding completes

---

## Error Handling

| Scenario | Handling |
|---|---|
| Ollama server down | AI query returns "AI unavailable" gracefully; full-text search still works |
| Embedding job fails | Retried 3x with backoff; page saves and remains full-text searchable |
| File upload fails | User shown error; partial upload cleaned from Supabase Storage |
| Supabase RLS violation | 403 returned; cross-workspace data never exposed |
| LLM response | Every response shows source citations for user verification |
| Large PDF extraction | Runs async; UI shows "indexing…" status until complete |

---

## Latency Expectations

- **Search (semantic):** ~60–150ms (embed query + pgvector search)
- **Ask (Q&A):** ~200–600ms to first token on GPU; streamed thereafter
- **Ollama hardware requirement:** GPU strongly recommended for hosting (RTX 3090/4090, Apple M-series); CPU-only adds 3–8s to first token

---

## Testing Strategy

| Type | Tool | Coverage |
|---|---|---|
| Unit | Vitest | Chunking logic, prompt assembly, edge detection, data helpers |
| Integration | Vitest + local Supabase | DB queries, pgvector search accuracy, RLS enforcement |
| E2E | Playwright | Create page, upload file, run query, team invite flow |
| CI | Ollama mocked | Stubbed responses for determinism; no real Ollama calls in CI |
