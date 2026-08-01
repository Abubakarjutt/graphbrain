# Phase A: Editor Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current bordered, non-persisting Tiptap box into a Notion-like block canvas with a slash menu, selection bubble menu, markdown shortcuts, and a rich block set (to-do, callout, toggle, image), all persisting correctly.

**Architecture:** Hand-rolled Tiptap v3 extensions on the existing editor core (preserves the `blocks` persistence path, `@`-mentions, backlinks, and embeddings). Custom nodes use React NodeViews. Three test layers: Vitest unit, RTL component, Playwright E2E.

**Tech Stack:** Next.js 16, React, Tiptap v3 (`^3.29.2`), ProseMirror, Tailwind v4, Vitest + Testing Library + user-event, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-31-phase-a-editor-canvas-design.md`

**Environment notes:**
- Local Supabase: API `127.0.0.1:54321`, DB container `supabase_db_graphbrain`. Apply migrations with `npx supabase migration up --local`.
- Run unit/component tests: `npx vitest run`. Run one file: `npx vitest run <path>`.
- Run E2E: `npx playwright test` (needs dev server + `E2E_EMAIL`/`E2E_PASSWORD`; config has `webServer`).
- **This is NOT the Next.js you know** — check `node_modules/next/dist/docs/` before touching routing/server code (per AGENTS.md).
- Every top-level Tiptap node is stored as one `blocks` row (`type`=node name, `content`=full node JSON). `pageToText`/`parseMentions` are generic recursive walkers — no changes needed for new node types.
- Work on a dedicated branch: `git checkout -b phase-a-editor-canvas` before Task 1.

---

## File Structure

**Create:**
- `supabase/migrations/<ts>_blocks_drop_type_check.sql` — drop the `blocks_type_check` constraint
- `src/components/editor/extensions/SlashCommand.ts` — slash extension (uses `@tiptap/suggestion`)
- `src/components/editor/extensions/slash-items.ts` — command registry
- `src/components/editor/extensions/markdown-rules.ts` — extra input rules (to-do/callout/toggle)
- `src/components/editor/extensions/Callout.tsx` — callout node + NodeView wiring
- `src/components/editor/extensions/Toggle.tsx` — toggle node + NodeView wiring
- `src/components/editor/SlashMenu.tsx` — command palette UI
- `src/components/editor/EditorBubbleMenu.tsx` — selection formatting menu
- `src/components/editor/CalloutView.tsx` — callout React NodeView
- `src/components/editor/ToggleView.tsx` — toggle React NodeView
- Test files mirrored under `src/__tests__/components/editor/…`
- `e2e/editor.spec.ts` — editor E2E flows

**Modify:**
- `src/components/editor/BlockEditor.tsx` — rewrite (borderless canvas, all extensions, menus)
- `src/components/editor/PageEditor.tsx` — Notion document styling
- `src/lib/types/database.ts` — relax `BlockType`; add Callout/Toggle attr types
- `package.json` — add deps
- `e2e/pages.spec.ts` — repair `Pages`→`Docs`, `new page`→`new doc`
- `src/__tests__/components/editor/BlockEditor.test.tsx` — update for rewrite
- `src/__tests__/lib/actions/blocks.test.ts` — round-trip for new node types

**Remove:**
- `src/components/editor/EditorToolbar.tsx` (+ its test if present)

---

## Task 1: Fix block persistence (A.0 — foundational)

**Files:**
- Create: `supabase/migrations/<ts>_blocks_drop_type_check.sql`
- Test: `src/__tests__/lib/actions/blocks.test.ts` (extend), `e2e/editor.spec.ts` (create, persistence case only)

- [ ] **Step 1: Write the migration**

Filename: use a timestamp after the latest existing migration, e.g. `20260731000006_blocks_drop_type_check.sql`.

```sql
-- The blocks.content column stores each node's full Tiptap JSON, so blocks.type
-- is redundant metadata. The fixed enum rejected Tiptap node names (paragraph,
-- heading, bulletList, …), so page bodies never persisted. Drop the constraint.
alter table blocks drop constraint if exists blocks_type_check;
```

- [ ] **Step 2: Apply and verify it fails-then-passes at the DB level**

Run:
```bash
npx supabase migration up --local
docker exec supabase_db_graphbrain psql -U postgres -d postgres -c \
  "insert into blocks (page_id, type, content, position) values \
   ((select id from pages limit 1),'paragraph','{}'::jsonb, 999) returning id;"
```
Expected: returns an `id` (previously threw `violates check constraint "blocks_type_check"`). Then clean up: `delete from blocks where position = 999;`

- [ ] **Step 3: Write the failing round-trip unit test**

In `src/__tests__/lib/actions/blocks.test.ts`, add a case asserting `saveBlocks` then `loadBlocks` round-trips a doc containing Tiptap node names (`paragraph`, `heading`, `taskList`, and a `callout`). Follow the file's existing Supabase-mock pattern; assert the inserted rows carry `type: 'paragraph'` etc. and that `loadBlocks` returns `content` in `position` order.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/__tests__/lib/actions/blocks.test.ts`
Expected: PASS (the action code already stores `node.type` unchanged; this locks the behavior).

- [ ] **Step 5: Write the E2E persistence regression**

Create `e2e/editor.spec.ts` with the login `beforeEach` copied from `e2e/pages.spec.ts`, and one test:

```ts
test('page body persists across reload', async ({ page }) => {
  await page.getByRole('button', { name: /new doc/i }).first().click()
  await page.waitForURL(/\/page\//)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await editor.type('Persistent body text')
  await page.waitForTimeout(1500) // debounced autosave (1s) + margin
  await page.reload()
  await expect(page.locator('.ProseMirror')).toContainText('Persistent body text')
})
```

- [ ] **Step 6: Run E2E**

Run: `npx playwright test e2e/editor.spec.ts -g "persists across reload"`
Expected: PASS. (Before the migration it failed — body was lost on reload.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/__tests__/lib/actions/blocks.test.ts e2e/editor.spec.ts
git commit -m "fix: drop blocks_type_check so page bodies persist"
```

---

## Task 2: Add dependencies + baseline extension config

**Files:**
- Modify: `package.json`, `src/components/editor/BlockEditor.tsx`

- [ ] **Step 1: Install deps**

Run:
```bash
npm install @tiptap/suggestion@^3.29.2 @tiptap/extension-task-list@^3.29.2 \
  @tiptap/extension-task-item@^3.29.2 @tiptap/extension-image@^3.29.2 \
  @tiptap/extension-bubble-menu@^3.29.2 @tiptap/extension-link@^3.29.2
```
Expected: added to `package.json` dependencies, no peer-dep errors.

- [ ] **Step 2: Verify StarterKit's bundled extensions to avoid duplicates**

Run: `cat node_modules/@tiptap/starter-kit/dist/index.d.ts | grep -iE "link|underline|configure" | head`
Expected: confirm whether `link` is bundled (StarterKit v3 bundles it). Note the option key (`link`) for disabling before re-adding.

- [ ] **Step 3: Update BlockEditor extension list (minimal, still compiles)**

In `BlockEditor.tsx`, extend the `extensions` array with TaskList/TaskItem and Link, disabling StarterKit's link to prevent duplicate registration:

```ts
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
// ...
extensions: [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: "Type '/' for commands" }),
],
```

- [ ] **Step 4: Run existing editor tests**

Run: `npx vitest run src/__tests__/components/editor`
Expected: PASS (BlockEditor still mounts; if the existing test asserts the old placeholder text, update it to `Type '/' for commands`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/editor/BlockEditor.tsx src/__tests__/components/editor
git commit -m "chore: add tiptap extensions (tasklist, image, link, bubble, suggestion)"
```

---

## Task 3: Borderless canvas + remove fixed toolbar

**Files:**
- Modify: `src/components/editor/BlockEditor.tsx`, `src/components/editor/PageEditor.tsx`
- Remove: `src/components/editor/EditorToolbar.tsx` (+ test if any)
- Test: `src/__tests__/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: Update BlockEditor test for the borderless canvas**

Assert the editor renders `.ProseMirror` and does **not** render the old toolbar buttons (query `screen.queryByLabelText('Bold')` → `null`). Keep the "renders content" / "calls onSave (debounced)" cases; use fake timers for the debounce.

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run src/__tests__/components/editor/BlockEditor.test.tsx`
Expected: FAIL (toolbar still present).

- [ ] **Step 3: Remove the toolbar and restyle**

Delete `EditorToolbar.tsx` and its import. Change the editor container to borderless and set editor prose classes:

```tsx
return <EditorContent editor={editor} />
```
and in `useEditor` `editorProps.attributes.class`:
```
'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[60vh]'
```

- [ ] **Step 4: Restyle PageEditor to a Notion document**

In `PageEditor.tsx`, drop the bordered wrapper around the editor; keep the centered column (`max-w-3xl mx-auto px-8 py-12`), the title `input`, autosave, and attachments. Ensure the title and body share the same column width.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/components/editor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/editor src/__tests__/components/editor
git commit -m "feat: borderless editor canvas, remove fixed toolbar"
```

---

## Task 4: Markdown shortcuts + to-do blocks

**Files:**
- Create: `src/components/editor/extensions/markdown-rules.ts`
- Modify: `src/components/editor/BlockEditor.tsx`
- Test: `src/__tests__/components/editor/markdown-rules.test.ts`

- [ ] **Step 1: Write failing input-rule tests**

Create an editor in the test with StarterKit + TaskList/TaskItem + the markdown-rules extension (use `@tiptap/react`'s `Editor` headless, no DOM needed for schema-level checks, or mount via RTL). Assert:
- typing `"# "` at line start makes the block a `heading` level 1
- typing `"[] "` makes a `taskItem`
- typing `"> "` makes a `blockquote`
- typing `"--- "` inserts a `horizontalRule`

Use ProseMirror's `editor.commands.insertContent` + input-rule simulation helper, or `user-event` typing into a mounted editor and assert `editor.getJSON()`.

- [ ] **Step 2: Run (expect fail)**

Run: `npx vitest run src/__tests__/components/editor/markdown-rules.test.ts`
Expected: FAIL (to-do rule missing).

- [ ] **Step 3: Implement markdown-rules extension**

`markdown-rules.ts` exports a Tiptap `Extension` adding an input rule mapping `^\[\]\s$` and `^\[ \]\s$` to a `taskItem`/`taskList`. (Heading/quote/hr/list rules already come from StarterKit — document that in a comment; only add what's missing.)

```ts
import { Extension } from '@tiptap/core'
import { wrappingInputRule } from '@tiptap/core'
// Adds the to-do shortcut "[] " → task list. Heading/quote/hr/list rules
// are already provided by StarterKit.
export const MarkdownRules = Extension.create({
  name: 'markdownRules',
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\[( |x)?\]\s$/,
        type: this.editor.schema.nodes.taskList,
      }),
    ]
  },
})
```
Register `MarkdownRules` in `BlockEditor.tsx` extensions.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/components/editor/markdown-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/extensions/markdown-rules.ts src/components/editor/BlockEditor.tsx src/__tests__/components/editor/markdown-rules.test.ts
git commit -m "feat: markdown shortcuts incl. to-do blocks"
```

---

## Task 5: Selection bubble menu

**Files:**
- Create: `src/components/editor/EditorBubbleMenu.tsx`
- Modify: `src/components/editor/BlockEditor.tsx`
- Test: `src/__tests__/components/editor/EditorBubbleMenu.test.tsx`

- [ ] **Step 1: Write failing component test**

Mount `EditorBubbleMenu` with a mock `editor` exposing `chain().focus().toggleBold().run()` and `isActive('bold')`. Assert clicking the Bold button calls `toggleBold`, and that when `isActive('bold')` returns true the button has an active class/`aria-pressed`.

- [ ] **Step 2: Run (expect fail)**

Run: `npx vitest run src/__tests__/components/editor/EditorBubbleMenu.test.tsx`
Expected: FAIL (component missing).

- [ ] **Step 3: Implement EditorBubbleMenu**

Use `BubbleMenu` from `@tiptap/react` (v3 export). Buttons: bold, italic, code, link (window.prompt for URL → `setLink`), and a "Turn into" group (paragraph/H1–3/quote). Ink/glass styling with gold active state. `aria-label` + `aria-pressed` on each.

- [ ] **Step 4: Mount in BlockEditor**

Render `<EditorBubbleMenu editor={editor} />` alongside `<EditorContent>`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/components/editor/EditorBubbleMenu.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/EditorBubbleMenu.tsx src/components/editor/BlockEditor.tsx src/__tests__/components/editor/EditorBubbleMenu.test.tsx
git commit -m "feat: selection bubble menu (bold/italic/code/link/turn-into)"
```

---

## Task 6: Slash command menu

**Files:**
- Create: `src/components/editor/extensions/SlashCommand.ts`, `src/components/editor/extensions/slash-items.ts`, `src/components/editor/SlashMenu.tsx`
- Modify: `src/components/editor/BlockEditor.tsx`
- Test: `src/__tests__/components/editor/slash-items.test.ts`, `src/__tests__/components/editor/SlashMenu.test.tsx`

- [ ] **Step 1: Write failing slash-items registry test**

Assert `slashItems` includes entries for text, h1–3, todo, bullet, numbered, quote, divider, code, image, callout, toggle; and a `filterSlashItems(query)` helper filters by label/keywords (e.g. `filterSlashItems('head')` returns the three headings; `filterSlashItems('')` returns all).

- [ ] **Step 2: Run (expect fail)** — `npx vitest run src/__tests__/components/editor/slash-items.test.ts` → FAIL.

- [ ] **Step 3: Implement slash-items.ts**

Export `SlashItem` type `{ title: string; keywords: string[]; group: 'Basic'|'Media'; command: (editor, range) => void }`, the `slashItems` array (each `command` deletes the slash range then runs the block command, e.g. `editor.chain().focus().deleteRange(range).toggleHeading({level:1}).run()`), and `filterSlashItems(query, items = slashItems)`.

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Write failing SlashMenu component test**

Mount `SlashMenu` with `items={slashItems}` and a `command` spy. Assert: renders all item titles; typing filters (pass a `query` prop or expose an input); ArrowDown+Enter invokes the highlighted item's callback; Escape calls `onClose`.

- [ ] **Step 6: Run (expect fail)** — FAIL.

- [ ] **Step 7: Implement SlashMenu.tsx** — keyboard-nav list (selected index state, arrow/enter/escape handlers), grouped by `group`, gold active row, `role="listbox"`.

- [ ] **Step 8: Implement SlashCommand.ts**

Tiptap `Extension` using `@tiptap/suggestion` with `char: '/'`, `startOfLine: false`. `render()` mounts `SlashMenu` in a positioned popup (use a lightweight ReactRenderer + `tippy`-free absolute positioning via `props.clientRect`, or `@tiptap/react`'s `ReactRenderer`). `command` calls the item's `command(editor, range)`. Register in BlockEditor.

- [ ] **Step 9: Run component tests** — `npx vitest run src/__tests__/components/editor/SlashMenu.test.tsx` → PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/editor/extensions/SlashCommand.ts src/components/editor/extensions/slash-items.ts src/components/editor/SlashMenu.tsx src/components/editor/BlockEditor.tsx src/__tests__/components/editor
git commit -m "feat: slash command menu"
```

---

## Task 7: Callout block

**Files:**
- Create: `src/components/editor/extensions/Callout.tsx`, `src/components/editor/CalloutView.tsx`
- Modify: `src/components/editor/extensions/slash-items.ts`, `src/components/editor/BlockEditor.tsx`, `src/lib/types/database.ts`
- Test: `src/__tests__/components/editor/Callout.test.tsx`

- [ ] **Step 1: Write failing node + view tests**

Assert: the `callout` node parses/serializes an `emoji` attr (default `💡`); `CalloutView` renders the emoji and its editable content region; `slashItems` gains a `callout` entry inserting a callout.

- [ ] **Step 2: Run (expect fail)** — FAIL.

- [ ] **Step 3: Implement Callout node**

`Callout.tsx`: `Node.create({ name: 'callout', group: 'block', content: 'block+', defining: true, addAttributes: emoji, parseHTML/renderHTML with data-emoji, addNodeView: ReactNodeViewRenderer(CalloutView) })`.

- [ ] **Step 4: Implement CalloutView.tsx** — `NodeViewWrapper` with colored box (Ink&Constellation), the emoji, and `<NodeViewContent>` for the body.

- [ ] **Step 5: Wire up** — register `Callout` in BlockEditor; add the slash item; add `CalloutAttrs` to types.

- [ ] **Step 6: Run tests** — PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/extensions/Callout.tsx src/components/editor/CalloutView.tsx src/components/editor/extensions/slash-items.ts src/components/editor/BlockEditor.tsx src/lib/types/database.ts src/__tests__/components/editor/Callout.test.tsx
git commit -m "feat: callout block"
```

---

## Task 8: Toggle block

**Files:**
- Create: `src/components/editor/extensions/Toggle.tsx`, `src/components/editor/ToggleView.tsx`
- Modify: `slash-items.ts`, `BlockEditor.tsx`, `src/lib/types/database.ts`
- Test: `src/__tests__/components/editor/Toggle.test.tsx`

- [ ] **Step 1: Write failing tests** — `toggle` node has `content: 'block+'`; `ToggleView` renders a disclosure triangle; clicking it toggles a local `open` state that hides/shows `<NodeViewContent>`; `slashItems` gains `toggle`.

- [ ] **Step 2: Run (expect fail)** — FAIL.

- [ ] **Step 3: Implement Toggle node** — like Callout, `addNodeView: ReactNodeViewRenderer(ToggleView)`. (Collapse state is view-only per spec — not persisted.)

- [ ] **Step 4: Implement ToggleView** — `NodeViewWrapper` with a button (`aria-expanded`) toggling `useState(true)`; render `<NodeViewContent>` only when open.

- [ ] **Step 5: Wire up + run** — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/extensions/Toggle.tsx src/components/editor/ToggleView.tsx src/components/editor/extensions/slash-items.ts src/components/editor/BlockEditor.tsx src/lib/types/database.ts src/__tests__/components/editor/Toggle.test.tsx
git commit -m "feat: toggle (collapsible) block"
```

---

## Task 9: Image block

**Files:**
- Modify: `src/components/editor/BlockEditor.tsx`, `slash-items.ts`
- Test: `src/__tests__/components/editor/image.test.tsx`

- [ ] **Step 1: Write failing test** — inserting via the image slash item adds an `image` node with a `src`; pasting/entering a URL sets `src`. (Upload path reuses existing file-storage helpers; test the URL path in jsdom and defer the real upload to E2E.)

- [ ] **Step 2: Run (expect fail)** — FAIL.

- [ ] **Step 3: Implement** — register `@tiptap/extension-image` (configure `inline: false`, `allowBase64: false`). Slash `image` item: prompt for URL (Phase A minimum) and/or trigger the existing `FileUploadButton` flow to obtain a public URL, then `editor.chain().focus().setImage({ src }).run()`.

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/BlockEditor.tsx src/components/editor/extensions/slash-items.ts src/__tests__/components/editor/image.test.tsx
git commit -m "feat: image block via slash menu"
```

---

## Task 10: E2E editor suite + repair broken specs

**Files:**
- Modify: `e2e/pages.spec.ts`
- Extend: `e2e/editor.spec.ts`

- [ ] **Step 1: Repair pages.spec.ts** — replace `getByText('Pages')` → `getByText('Docs')` and `name: /new page/i` → `/new doc/i` (broken by the earlier sidebar rename).

- [ ] **Step 2: Run** — `npx playwright test e2e/pages.spec.ts` → PASS.

- [ ] **Step 3: Add editor E2E flows to editor.spec.ts** — one test each:
  - `/` menu inserts a heading (type `/`, pick Heading, assert `h1`).
  - select text → bubble → Bold (assert `<strong>`).
  - markdown `"# "` → heading.
  - to-do: `"[] "` then click checkbox → item marked done.
  - toggle: insert, collapse hides content.
  - image: insert via URL → `<img src>` present.

- [ ] **Step 4: Run** — `npx playwright test e2e/editor.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/pages.spec.ts e2e/editor.spec.ts
git commit -m "test: repair pages e2e for Docs rename; add editor e2e suite"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full unit/component suite** — `npx vitest run` → all green.
- [ ] **Step 2: Full E2E** — `npx playwright test` → all green.
- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no new errors (4 pre-existing test-file errors in callback/middleware tests are known and out of scope).
- [ ] **Step 4: Manual smoke** — start dev server, create a doc, exercise `/`, bubble menu, each block type, reload to confirm persistence.
- [ ] **Step 5: Finish the branch** — use `superpowers:finishing-a-development-branch` (tests pass → push PR → independent review → fix → merge).

---

## Self-Review

**Spec coverage:**
- A.0 persistence fix → Task 1 ✅
- Dependencies → Task 2 ✅
- Borderless canvas + toolbar removal → Task 3 ✅
- Markdown shortcuts + to-do → Task 4 ✅
- Bubble menu → Task 5 ✅
- Slash menu → Task 6 ✅
- Callout → Task 7 ✅; Toggle → Task 8 ✅; Image → Task 9 ✅
- Test repair (Docs rename, BlockEditor, blocks round-trip) → Tasks 1, 3, 10 ✅
- Three-layer testing → present in every task ✅
- `pageToText`/`parseMentions` unchanged → honored (no task touches them) ✅

**Type consistency:** `SlashItem.command(editor, range)` signature is used identically in slash-items, SlashMenu, and SlashCommand. `callout`/`toggle` node names match between extension, slash item, and tests. `taskList`/`taskItem` names match Tiptap's.

**Deferred (not in this plan):** drag handle (B), icon/cover/breadcrumbs (C), DB list/gallery (D), columns/tables and persisted toggle state (later).
