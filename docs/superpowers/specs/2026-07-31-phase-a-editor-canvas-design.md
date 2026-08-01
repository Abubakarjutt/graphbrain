# Phase A: The Editor Canvas — Design Spec
**Date:** 2026-07-31

## Overview

Phase A transforms the current Tiptap editor (a bordered box with a fixed B/I/H1 toolbar that **cannot persist content**) into a Notion-like block canvas. It delivers the three interactions that define the Notion feel — the **slash menu**, the **selection bubble menu**, and **markdown shortcuts** — plus a richer block set, on a borderless centered writing surface styled in the existing "Ink & Constellation" aesthetic.

This is the first of five phases (A–E) decomposing the "Notion-like experience." It is deliberately scoped so the app remains fully working after it ships, with comprehensive unit + component + E2E coverage on every new interaction.

**Block set (Phase A):** text, H1/H2/H3, bulleted list, numbered list, to-do (checkbox), quote, divider, code block, callout, toggle, image.

**Explicitly out of scope** (later phases): block drag-handle/reordering (Phase B); page icon, cover image, breadcrumbs (Phase C); database List/Gallery views (Phase D); columns and in-page tables (later). No changes to the graph/embedding pipeline.

---

## Foundational fix (A.0): block persistence

**Problem (verified):** the `blocks` table is empty and every save fails. `saveBlocks` writes `type: node.type` using Tiptap's node names (`paragraph`, `heading`, `bulletList`, `codeBlock`, …), but the `blocks_type_check` CHECK constraint only permits `text, heading_1/2/3, bullet, numbered, code, image, file, embed`. Inserting a `paragraph` throws `violates check constraint "blocks_type_check"`, which `PageEditor` swallows as "Failed to save content." **No page body has ever persisted.**

**Decision:** the `content` column already stores each node's full JSON, so `type` is redundant metadata. A fixed enum is the wrong shape for a block editor that keeps gaining node types. **Drop `blocks_type_check`.** `type` remains `text NOT NULL`.

**Changes:**
- New migration `supabase/migrations/<ts>_blocks_drop_type_check.sql`: `alter table blocks drop constraint blocks_type_check;`
- `src/lib/types/database.ts`: relax/annotate `BlockType` (kept as a documentation union but no longer authoritative; storage accepts any Tiptap node name).
- **No change** to `pageToText` or `parseMentions` — both are already generic recursive walkers that extract `node.text` and `[[mentions]]` from arbitrarily nested nodes, so callout/toggle/to-do text and mentions are indexed automatically.

**Guard:** an E2E regression test asserting a page body survives reload, plus a unit round-trip test (save → load) — so this class of bug can never regress silently.

---

## Dependencies to add

Only `@tiptap/starter-kit`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/extension-placeholder` are currently in `package.json`. Phase A adds (pinned to the installed Tiptap `^3.29.2` line):

| Package | Purpose |
|---|---|
| `@tiptap/suggestion` | Powers the `/` slash menu |
| `@tiptap/extension-task-list` | To-do list container |
| `@tiptap/extension-task-item` | To-do checkbox item |
| `@tiptap/extension-image` | Image block |
| `@tiptap/extension-bubble-menu` | Selection bubble menu (currently only a transitive dep — make explicit) |
| `@tiptap/extension-link` | Link mark for the bubble menu (currently only transitive — make explicit) |

**Note:** StarterKit v3 already bundles base nodes plus Link and Underline. Extensions must be configured to avoid duplicate-registration errors (e.g. `StarterKit.configure({ link: false })` before adding Link explicitly, per the installed StarterKit's option surface).

---

## Architecture

**Approach:** hand-rolled Tiptap extensions on the existing Tiptap core (Approach 1). This preserves the persistence path, `@`-mentions, backlinks, and embedding pipeline (all built around Tiptap JSON), keeps the aesthetic under our control, and keeps every piece testable with no heavyweight editor dependency or lock-in.

### New files

| File | Responsibility |
|---|---|
| `src/components/editor/extensions/SlashCommand.ts` | Tiptap extension built on `@tiptap/suggestion`; detects `/`, manages the query, renders `SlashMenu`, runs the chosen command |
| `src/components/editor/extensions/slash-items.ts` | The command registry: label, keywords, icon, and `command(editor, range)` for each block type |
| `src/components/editor/extensions/Callout.tsx` | Custom node + React NodeView (emoji + colored container + nested content) |
| `src/components/editor/extensions/Toggle.tsx` | Custom node + React NodeView (collapsible: summary line + hidden children) |
| `src/components/editor/extensions/markdown-rules.ts` | Input rules for shortcuts not covered by StarterKit (`[] ` to-do, callout/toggle triggers); documents which shortcuts StarterKit already provides |
| `src/components/editor/SlashMenu.tsx` | Filterable, keyboard-navigable command palette rendered by SlashCommand |
| `src/components/editor/EditorBubbleMenu.tsx` | Floating menu on text selection: bold, italic, code, link, "turn into" |
| `src/components/editor/CalloutView.tsx` | React NodeView UI for Callout |
| `src/components/editor/ToggleView.tsx` | React NodeView UI for Toggle |

### Modified files

| File | Change |
|---|---|
| `src/components/editor/BlockEditor.tsx` | Rewrite: borderless centered ~720px column; register all extensions; host SlashMenu + EditorBubbleMenu; keep the debounced 1s autosave |
| `src/components/editor/PageEditor.tsx` | Restyle to a Notion document (drop the bordered wrapper, title flows into the canvas); autosave + attachments logic unchanged |
| `src/lib/types/database.ts` | Relax `BlockType`; add any node-attr types needed for Callout/Toggle |
| `package.json` | Add the six dependencies above |

### Removed files

| File | Reason |
|---|---|
| `src/components/editor/EditorToolbar.tsx` | The fixed B/I/H1 bar is replaced by the selection bubble menu (the clean-canvas Notion model) |

---

## Interaction design

### Slash menu (`/`)
- Typing `/` at the start of an empty block (or after whitespace) opens a floating command palette anchored at the caret.
- Filter as you type; ↑/↓ navigate; Enter selects; Escape/blur/space-without-match closes.
- Grouped items: **Basic** (text, H1–3, to-do, bullet, numbered, quote, divider, code) and **Media** (image, callout, toggle).
- Selecting an item replaces the `/query` range with the chosen block.

### Bubble menu (text selection)
- Appears on non-empty text selection; hides on empty selection/blur.
- Actions: bold, italic, inline code, link (prompt for URL), and "turn into" (paragraph/H1–3/quote).
- Reflects active marks (e.g. bold highlighted when the selection is bold).

### Markdown shortcuts
`# `→H1, `## `→H2, `### `→H3, `- `/`* `→bullet, `1. `→numbered, `[] `/`[ ] `→to-do, `> `→quote, `` ``` ``→code block, `--- `→divider. Most come from StarterKit input rules; `markdown-rules.ts` adds to-do, callout, and toggle triggers.

### Block behaviors
- **To-do:** checkbox toggles done state; done items get strikethrough styling.
- **Callout:** colored box with a leading emoji; body is editable nested content.
- **Toggle:** click the triangle to collapse/expand; collapsed state is view-only (not persisted per Phase A — always loads expanded).
- **Image:** inserted via slash menu → upload through the existing Supabase file-storage path, or paste an image URL. Renders responsively within the column.

---

## Aesthetic

Borderless, centered `max-w` ≈ 720px column with generous line-height and vertical rhythm. Uses the Ink & Constellation tokens (warm paper light / ink dark, champagne-gold accents). Slash menu and bubble menu are ink/glass popovers with a gold active state. Per-node placeholder ("Type '/' for commands") on empty paragraphs.

---

## Data flow

Unchanged pipeline: Tiptap JSON → `saveBlocks` (debounced 1s) → `blocks` rows (one per top-level node, `content` = full node JSON) → `loadBlocks` rebuilds the document ordered by `position`. New node types round-trip automatically once A.0 removes the constraint. Mentions, backlinks, and embeddings continue through the existing `after()` hooks with no changes.

---

## Error handling

- Save failures surface inline via the existing `saveError` pattern in `PageEditor`.
- Slash menu closes cleanly on Escape/blur/no-match; never traps focus.
- Image upload errors show an inline message; a failed upload leaves no broken node.
- Callout/Toggle render empty-state placeholders when they have no content.
- All menus are keyboard-accessible (arrow/enter/escape) and `aria`-labeled.

---

## Testing strategy

Every new extension/block ships with coverage at three layers. This is behavioral coverage, not vanity counts — no interaction ships untested.

**Unit (Vitest):**
- Input-rule conversions (e.g. `"# "` → heading; `"[] "` → to-do) via ProseMirror transactions.
- Slash-item registry: filtering by query/keywords, ordering, `command()` effects.
- Save → load JSON round-trip for each block type (including callout/toggle/image/to-do).
- Callout/Toggle node schema: attrs parse/serialize correctly.

**Component (React Testing Library + user-event, jsdom):**
- `SlashMenu`: renders items, filters on input, keyboard nav, Enter runs command, Escape closes.
- `EditorBubbleMenu`: toggles marks, reflects active state.
- `CalloutView` / `ToggleView`: render, edit, collapse/expand.
- `PageEditor`: title save; save-error surface.

**E2E (Playwright, real browser — the layer jsdom can't fake):**
- **Persistence regression:** create page → type body → reload → body still present.
- Slash menu inserts each block type.
- Select text → bubble menu → bold applies.
- Each markdown shortcut converts correctly.
- To-do check toggles; toggle collapses; image inserts.
- Autosave persists without an explicit save action.

**Test repair (required):**
- `e2e/pages.spec.ts` currently asserts `getByText('Pages')` and `/new page/i`; the earlier sidebar "Pages → Docs" rename broke these — update to `Docs` / `New doc`.
- `src/__tests__/components/editor/BlockEditor.test.tsx` — update for the rewritten borderless editor (no fixed toolbar).
- `src/__tests__/lib/actions/blocks.test.ts` — extend round-trip coverage for new node types; keep green against the dropped constraint.

---

## Success criteria

- A page body persists across reloads (the core bug is fixed and guarded by a test).
- `/` opens a working, filterable, keyboard-navigable block menu covering all Phase A block types.
- Selecting text shows a bubble menu that applies formatting.
- All listed markdown shortcuts work.
- To-do, callout, toggle, and image blocks render, edit, and round-trip through storage.
- The editor is borderless, centered, and styled in the Ink & Constellation aesthetic; the fixed toolbar is gone.
- Full suite green (Vitest + Playwright), including the new tests and the repaired specs.

---

## Out of scope / deferred

- Block drag-handle and reordering → **Phase B**
- Page icon, cover image, breadcrumbs → **Phase C**
- Database List/Gallery views → **Phase D**
- Columns, in-page tables, persisted per-user toggle collapse state → later
