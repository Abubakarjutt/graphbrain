# Database Docs: Create, Paste & Upload (Markdown Import)

**Date:** 2026-08-14
**Status:** Draft

---

## Overview

Each database gains a **Docs** view (alongside Table/Kanban/Calendar) where users can create free-form documents scoped to that database — either by starting a blank doc and pasting content into it, or by uploading a `.pdf`, `.docx`/`.doc`, `.txt`, or `.md` file that gets converted into an **editable** page in the block editor, not a read-only file preview.

This builds on the existing Phase 2c file-attachment infrastructure (`src/lib/actions/files.ts`, `FileUploadButton`, the `pdf-parse`/`mammoth` extraction pipeline) but changes the outcome: instead of raw `extracted_text` shown in a `<pre>` block on a dedicated `FilePage`, uploaded documents are parsed into **markdown**, converted into Tiptap blocks, and saved through the same `saveBlocks`/`loadBlocks` path as any manually-created page. The original file stays in Storage for reference/download.

PDF is the hard case: `pdf-parse` only yields flat text with no structural information. To recover headings/lists/emphasis, extracted PDF text is reformatted into markdown by the workspace's existing local LLM (`streamChat` in `src/lib/graph/ollama.ts`, model `gemma4:12b-mlx` via Ollama — no external API, no added per-request cost). DOCX already has real structure, so it converts via `mammoth` → HTML → `turndown` → markdown without an LLM call. TXT/MD need no LLM call either.

---

## Supported File Types & Parsing Path

| Type | Extensions | Parse path | LLM used? |
|------|-----------|------------|-----------|
| Markdown | md | Used as-is | No |
| Plain text | txt | Blank-line paragraph splitting → markdown | No |
| Word document | docx, doc | `mammoth.convertToHtml()` → `turndown` → markdown | No |
| PDF | pdf | `pdf-parse` → chunked → `streamChat` reformat per chunk → concatenated markdown | Yes (local Ollama) |

Any other type is rejected client-side by the upload picker's `accept` attribute (this flow does not reuse `FileUploadButton`'s generic "any file" path — see Components).

---

## Architecture

### Doc creation (blank + paste)

```
Client (Docs view)              Server Action
  │── createPage(ws, null, databaseId) ──>│
  │                    INSERT pages (database_id set)
  │<─ { pageId } ─────────────────────────│
  │── router.push(page route) ────────────│
```
Tiptap's default clipboard handling already turns pasted rich text/HTML into
blocks on paste — no new editor code needed for "paste content from elsewhere."

### Doc creation (upload + parse)

```
Client                    Server Action              Ollama          Supabase
  │─ getUploadUrl(...) ──────>│                                          │
  │<─ signedUrl, storagePath ─│                                          │
  │─ PUT bytes ────────────────────────────────────────────────────────>│
  │─ createDatabaseDocPage(...) ─>│                                      │
  │              INSERT pages (database_id set) + files (status=pending) │
  │<─ { pageId } ──────────────│                                         │
  │  router.push(page route, shows "Processing…" view)                  │
  │                    after(): runDocParse()                           │
  │                      1. download bytes from Storage                 │
  │                      2. extract raw text (pdf-parse / mammoth / utf8)│
  │                      3. PDF only: chunk + streamChat reformat ──────>│
  │                      4. markdown → HTML (marked) → Tiptap JSON       │
  │                         (@tiptap/html generateJSON)                 │
  │                      5. INSERT blocks (same shape as saveBlocks)     │
  │                      6. UPDATE files SET extraction_status='done'   │
  │  client polls getFileRecord every 3s while pending, then reloads    │
  │  BlockEditor with the parsed blocks                                 │
```

---

## Data Model

### Migration

```sql
-- supabase/migrations/20260814000001_pages_database_id.sql
ALTER TABLE pages
  ADD COLUMN database_id uuid REFERENCES databases(id) ON DELETE CASCADE;

CREATE INDEX pages_database_id_idx ON pages(database_id) WHERE database_id IS NOT NULL;
```

No RLS changes needed — `pages_select`/`insert`/`update`/`delete` policies already scope by `workspace_id` via `is_workspace_member(workspace_id)`, which is unaffected by the new column.

A "doc" is a `pages` row with `database_id` set. This is orthogonal to:
- `database_rows.page_id` (a row's own page) — rows and docs are independent lists.
- `pages.parent_id` (used by file attachments today) — docs live at `parent_id = null`, `database_id = <the database>`.

### Updated `Page` Type

```ts
export interface Page {
  id: string
  workspace_id: string
  parent_id: string | null
  database_id: string | null   // NEW — set when this page is a database doc
  title: string
  created_by: string
  created_at: string
  updated_at: string
}
```

`files.extraction_status`/`extracted_text` are unchanged in shape; `runDocParse` writes to the same columns as today's `runExtraction`, so `FilePage`'s existing pending/error UI pattern can be reused for the processing view (see Components).

---

## File Map

| Action | Path |
|--------|------|
| Create | `supabase/migrations/20260814000001_pages_database_id.sql` |
| Create | `src/components/database/DocsView.tsx` |
| Create | `src/components/database/NewDocButton.tsx` |
| Create | `src/components/database/DocUploadButton.tsx` |
| Create | `src/components/editor/DocProcessing.tsx` |
| Create | `src/lib/parsing/textToMarkdown.ts` (txt heuristic) |
| Create | `src/lib/parsing/docxToMarkdown.ts` (mammoth + turndown) |
| Create | `src/lib/parsing/pdfToMarkdown.ts` (pdf-parse + chunk + LLM reformat) |
| Create | `src/lib/parsing/markdownToBlocks.ts` (marked + @tiptap/html generateJSON) |
| Create | `src/__tests__/lib/parsing/*.test.ts` |
| Modify | `src/lib/actions/files.ts` — add `createDatabaseDocPage`, `runDocParse`, `retryDocParse` |
| Modify | `src/lib/actions/pages.ts` — `createPage` gains optional `databaseId` param |
| Modify | `src/lib/actions/databases.ts` — add `getDatabaseDocs(databaseId, workspaceId)` |
| Modify | `src/lib/types/database.ts` — `Page.database_id` |
| Modify | `src/components/database/DatabaseShell.tsx` — add `Docs` view tab |
| Modify | `src/app/(app)/workspace/[workspaceId]/database/[databaseId]/page.tsx` — fetch docs |
| Modify | `src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx` — route to `DocProcessing` while pending |

---

## Server Actions

### `createPage(workspaceId, parentId, databaseId?)` (modified)

Adds an optional third parameter. When set, inserts `database_id` alongside the existing columns. Existing callers (`NewPageButton`) are unaffected — `databaseId` defaults to `undefined`/`null`.

### `getDatabaseDocs(databaseId, workspaceId)` (new, `databases.ts`)

- Validates workspace membership
- `SELECT * FROM pages WHERE database_id = databaseId AND workspace_id = workspaceId ORDER BY created_at`
- Returns `Page[]`

### `createDatabaseDocPage(workspaceId, databaseId, filename, storagePath, mimeType, reservedPageId)` (new, `files.ts`)

Parallel to `createFilePage`, but:
- Inserts `pages` with `database_id = databaseId`, `parent_id = null` (instead of `parent_id = parentPageId`)
- Inserts `files` record the same way (`extraction_status = 'pending'` for all four supported types — there's no `'none'` case here since the upload picker only accepts parseable types)
- Schedules `runDocParse` via `after()` instead of `runExtraction`
- Same cleanup-on-failure behavior as `createFilePage`

### `runDocParse(fileId, storagePath, mimeType, workspaceId, pageId)` (new, `files.ts`, runs inside `after()`)

```
1. Download bytes from Storage
2. Branch on mimeType → raw markdown string:
     text/markdown         → utf-8 string, used as-is
     text/plain             → textToMarkdown(buffer)
     .docx/.doc mime types  → docxToMarkdown(buffer)
     application/pdf        → pdfToMarkdown(buffer)   [chunked, LLM-backed]
3. markdownToBlocks(markdown) → TiptapDocument
4. INSERT blocks for pageId from TiptapDocument.content (same insert shape as saveBlocks)
5. UPDATE files SET extraction_status = 'done' WHERE id = fileId
6. On any error at any step → UPDATE files SET extraction_status = 'error'
   (partial LLM-chunk failures during step 2's PDF branch count as a full
   failure — no partially-reformatted doc is ever saved)
7. Graph write (upsertNode/scheduleEmbed), same independent try/catch pattern
   runExtraction uses today — a graph-write failure never flips extraction_status
```

### `retryDocParse(fileId, workspaceId)` (new, `files.ts`)

Doc-page counterpart to `retryExtraction` — same shape (fetch the `files` row, verify workspace membership, re-run the parse via `after()`, return the updated `FileRecord`), but calls `runDocParse` instead of `runExtraction`. Kept as a separate action rather than branching inside `retryExtraction`, since the two pipelines write different things (`extracted_text` vs. `blocks`) and the page route already knows which kind of page it's looking at.

---

## Parsing Pipeline Details

### `textToMarkdown(buffer)` — TXT

Split on blank lines (`\n\s*\n`), trim each paragraph, join with double newlines. No headings inferred.

### `docxToMarkdown(buffer)` — DOCX/DOC

```ts
const html = (await mammoth.convertToHtml({ buffer })).value
const markdown = new TurndownService().turndown(html)
```
Real structure (headings, bold/italic, lists, links) survives because it comes from the document's actual styling, not inference.

### `pdfToMarkdown(buffer)` — PDF

```
1. text = (await new PDFParse({ data: buffer }).getText()).text
2. chunks = splitIntoChunks(text, { targetSize: 7000, hardMax: 8000 })
   — split on paragraph boundaries where possible, never mid-word
3. for each chunk (sequentially, to keep Ollama load predictable):
     markdown_chunk = await reformatChunk(chunk)   // consumes streamChat fully, concatenates tokens
     if reformatChunk throws → abort entire parse, propagate error (see runDocParse step 6)
4. return chunks.join('\n\n')
```

`reformatChunk` prompt (fixed system framing, chunk as untrusted content — same prompt-injection guard pattern as `buildPrompt` in `ask/route.ts`):
```
Reformat the following extracted PDF text into clean markdown.
Infer headings, lists, and emphasis from context. Do not add commentary,
do not summarize, preserve all content. Output markdown only.

Text:
<chunk>
```

### `markdownToBlocks(markdown)` — markdown → Tiptap JSON

```ts
const html = marked.parse(markdown)
const json = generateJSON(html, [
  StarterKit.configure({ link: false }), Link, TaskList, TaskItem, Image,
])
```
Uses the same extension set as `BlockEditor` (minus editor-interaction-only extensions like `Placeholder`/`SlashCommand`/`MarkdownRules`, which add no schema nodes). `Callout`/`Toggle` are intentionally excluded — standard markdown has no syntax that maps to them, so imported docs never produce those node types, which is correct.

**Implementation risk to verify early:** `@tiptap/html`'s `generateJSON` needs to be confirmed to run server-side (inside `after()`, no browser DOM) without requiring `jsdom` as an extra dependency. If it does need a DOM, add `jsdom` as a dependency and pass it explicitly — this is a small, contained fallback and doesn't change the design.

---

## Components

### `DocsView` (`src/components/database/DocsView.tsx`)

New view rendered by `DatabaseShell` when the `Docs` tab is active (sibling to `TableView`/`KanbanView`/`CalendarView`). Receives `docs: Page[]` (from `getDatabaseDocs`, fetched server-side same as `rows`/`todoBoard` today). Renders a simple list (title, created date) linking to each doc's page route, plus `NewDocButton` and `DocUploadButton` in the header.

### `NewDocButton` (`src/components/database/NewDocButton.tsx`)

Same pattern as `NewPageButton`, but calls `createPage(workspaceId, null, databaseId)` and navigates to the result.

### `DocUploadButton` (`src/components/database/DocUploadButton.tsx`)

Same upload mechanics as `FileUploadButton` (signed URL, `XMLHttpRequest` PUT with progress), but:
- `<input accept=".pdf,.docx,.doc,.txt,.md">`
- Calls `createDatabaseDocPage` instead of `createFilePage`
- On success, navigates straight to the new doc's page route (which will show `DocProcessing` while pending)

### `DocProcessing` (`src/components/editor/DocProcessing.tsx`)

Client component shown by the page route instead of `PageEditor`/`BlockEditor` while `files.extraction_status = 'pending'` for a doc page. Polls `getFileRecord` every 3s (same pattern/limits as `FilePage`: 10 attempts, then "Retry" via `retryExtraction`... generalized to also accept doc pages, see below). Once `done`, the page route re-renders (client calls `router.refresh()`) and the normal `PageEditor`/`BlockEditor` takes over with the parsed blocks — no separate "doc viewer," it's the same editor a hand-created page uses.

On `error`: same "Extraction failed" + Retry affordance as `FilePage` today, but the Retry button calls `retryDocParse` instead of `retryExtraction`.

---

## Page Route Changes

`src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx`:

1. After the existing `getFileRecord(pageId, workspaceId)` check: if a `FileRecord` exists **and** the page's `database_id` is set → this is a doc page, not a file-attachment page.
   - If `extraction_status === 'pending'` → render `DocProcessing`
   - If `extraction_status === 'error'` → render `DocProcessing` (it owns the error/retry UI too)
   - If `extraction_status === 'done'` → fall through to the normal `loadBlocks` + `PageEditor` path (blocks already exist in the `blocks` table from `runDocParse`)
2. If a `FileRecord` exists and `database_id` is **not** set → unchanged, renders `FilePage` (today's file-attachment behavior).
3. Non-file pages are unchanged.

---

## Error Handling

| Scenario | Handling |
|----------|---------|
| Upload succeeds, `runDocParse` never runs (server crash) | `extraction_status` stays `pending`; client polls 10× then shows Retry (via `DocProcessing`) |
| `pdf-parse` throws (encrypted/malformed PDF) | `extraction_status = 'error'`; original file still downloadable; blocks table untouched |
| One PDF chunk's `streamChat` call fails/times out | Whole parse aborts, `extraction_status = 'error'` — never save a doc that's reformatted for only part of its content |
| Ollama unreachable | Same as above — `streamChat`/`embed` already throw on connection failure, `runDocParse` catches and sets `'error'` |
| `mammoth`/`turndown` throws on corrupt DOCX | `extraction_status = 'error'` |
| `generateJSON` throws on malformed markdown/HTML | `extraction_status = 'error'` (treated as a parse failure like any other step) |
| Retry requested | `retryDocParse` re-runs `runDocParse` from scratch (re-downloads original bytes) — safe because `blocks` are deleted-and-reinserted, matching `saveBlocks`'s existing delete-then-insert pattern |
| Upload picker given an unsupported extension | Rejected client-side by `accept`; `createDatabaseDocPage` also validates `mimeType` server-side and throws before any insert |

---

## Testing

### Unit Tests (`src/__tests__/lib/parsing/*.test.ts`)

- `textToMarkdown`: paragraph splitting on blank lines, trims whitespace
- `docxToMarkdown`: fixture `.docx` with heading/list/bold → expected markdown structure (mock `mammoth`/use a small real fixture)
- `pdfToMarkdown`: chunk-boundary logic splits on paragraph breaks, never mid-word; a failing chunk call propagates and aborts (mock `streamChat`)
- `markdownToBlocks`: markdown with heading/list/link/bold → expected Tiptap JSON node types

### Action Tests (`src/__tests__/lib/actions/files.test.ts`, extended)

- `createDatabaseDocPage`: inserts `pages` with `database_id` set, `parent_id` null; rejects unsupported `mimeType`
- `runDocParse`: happy path sets `extraction_status = 'done'` and inserts blocks; any step throwing sets `'error'` and leaves `blocks` untouched

### Component Tests

- `DocsView.test.tsx`: renders doc list, New doc button calls `createPage` with `databaseId`, Upload button restricts `accept`
- `DocProcessing.test.tsx`: pending → polls → done triggers refresh; timeout → Retry shown; error → Retry shown

### Integration (`src/__tests__/components/database/DatabaseShell.integration.test.tsx`, extended)

- Switching to Docs tab lists docs scoped to the current database only (mirrors the existing "document picker only shows pages belonging to the current database" fix from the Kanban attach flow)

---

## Dependencies

New npm packages:
- `turndown` — HTML → Markdown conversion (for the DOCX path)
- `marked` — Markdown → HTML conversion (for the markdown → Tiptap JSON path)
- `@tiptap/html` — HTML → Tiptap JSON (`generateJSON`), server-side
- `@types/turndown` (dev)

Already available, reused as-is: `pdf-parse`, `mammoth`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-image`, `src/lib/graph/ollama.ts` (`streamChat`).
