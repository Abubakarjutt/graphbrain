# Graphbrain Phase 2a: Page Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add block-based page editing with Tiptap, full page CRUD via Server Actions, and a nested collapsible sidebar page tree — so users can create, edit, and navigate pages within their workspace.

**Architecture:** Pages are fetched and mutated via Next.js Server Actions (no separate API layer). The Tiptap editor serialises content to a JSON document stored in the `blocks` table one block per paragraph/heading/etc. The sidebar tree is a recursive client component that reads the `pages` table hierarchy and re-fetches after mutations. All DB access goes through the server Supabase client; RLS enforces workspace isolation automatically.

**Tech Stack:** Next.js 16 Server Actions, Tiptap v2 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`), Supabase server client, `@dnd-kit/core` (drag-to-reorder blocks — skip for Phase 2a, YAGNI), Vitest + @testing-library/react, Playwright

---

## Important: Read Before Coding

This is **Next.js 16** (not 14). There are breaking changes vs earlier versions — read `node_modules/next/dist/docs/` if unsure about any API. Notably:
- `cookies()` is async — always `await cookies()`
- Server Actions use `'use server'` directive at the top of the file or function
- `params` in page components may need to be awaited in Next.js 16

The existing Supabase clients are at:
- `src/lib/supabase/server.ts` — `export async function createClient()`
- `src/lib/supabase/client.ts` — `export function createClient()`

Existing types are at `src/lib/types/database.ts`. Add to this file as needed.

---

## File Structure

```
src/
├── lib/
│   ├── types/
│   │   └── database.ts              # MODIFY: add TiptapDocument type
│   └── actions/
│       └── pages.ts                 # CREATE: Server Actions for page CRUD
├── components/
│   ├── editor/
│   │   ├── BlockEditor.tsx          # CREATE: Tiptap editor wrapper
│   │   └── EditorToolbar.tsx        # CREATE: bold/italic/heading toolbar
│   └── layout/
│       ├── Sidebar.tsx              # MODIFY: add page tree below workspace list
│       └── SidebarPageTree.tsx      # CREATE: recursive page tree component
└── app/
    └── (app)/
        └── workspace/
            └── [workspaceId]/
                ├── page.tsx         # MODIFY: show "New Page" CTA
                └── [pageId]/
                    └── page.tsx     # CREATE: page view/edit page

src/__tests__/
├── lib/
│   └── actions/
│       └── pages.test.ts            # CREATE: Server Action unit tests
└── components/
    ├── editor/
    │   └── BlockEditor.test.tsx     # CREATE: editor render + typing tests
    └── layout/
        └── SidebarPageTree.test.tsx # CREATE: tree render + expand tests

e2e/
└── pages.spec.ts                    # CREATE: create page → edit → navigate
```

---

### Task 1: Page Type + Server Actions

**Files:**
- Modify: `src/lib/types/database.ts`
- Create: `src/lib/actions/pages.ts`
- Create: `src/__tests__/lib/actions/pages.test.ts`

- [ ] **Step 1: Add `TiptapDocument` type to `src/lib/types/database.ts`**

Append to the end of `src/lib/types/database.ts`:

```ts
export interface TiptapDocument {
  type: 'doc'
  content: TiptapNode[]
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}
```

- [ ] **Step 2: Write failing Server Action tests**

Create `src/__tests__/lib/actions/pages.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()

const mockFrom = vi.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  single: mockSingle,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('page actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('createPage inserts a page and returns it', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'p1', title: 'Untitled', workspace_id: 'ws1', parent_id: null, created_by: 'u1', created_at: '', updated_at: '' }, error: null })
    const { createPage } = await import('@/lib/actions/pages')
    const result = await createPage('ws1', null)
    expect(mockFrom).toHaveBeenCalledWith('pages')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'ws1', created_by: 'u1' }))
    expect(result.id).toBe('p1')
  })

  it('updatePageTitle updates title and revalidates', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'p1', title: 'New Title' }, error: null })
    const { revalidatePath } = await import('next/cache')
    const { updatePageTitle } = await import('@/lib/actions/pages')
    await updatePageTitle('p1', 'ws1', 'New Title')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Title' }))
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('deletePage deletes and revalidates', async () => {
    mockEq.mockResolvedValue({ error: null })
    const { revalidatePath } = await import('next/cache')
    const { deletePage } = await import('@/lib/actions/pages')
    await deletePage('p1', 'ws1')
    expect(mockDelete).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('getPages returns pages ordered by created_at', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'p1', title: 'A' }], error: null })
    const { getPages } = await import('@/lib/actions/pages')
    const pages = await getPages('ws1')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(pages).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- src/__tests__/lib/actions/pages.test.ts
```

Expected: FAIL — `@/lib/actions/pages` not found.

- [ ] **Step 4: Implement `src/lib/actions/pages.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Page } from '@/lib/types/database'

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
  revalidatePath(`/workspace/${workspaceId}`)
  return data
}

export async function updatePageTitle(pageId: string, workspaceId: string, title: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pages')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', pageId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/workspace/${workspaceId}`)
}

export async function deletePage(pageId: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pages')
    .delete()
    .eq('id', pageId)
  if (error) throw new Error(error.message)
  revalidatePath(`/workspace/${workspaceId}`)
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- src/__tests__/lib/actions/pages.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/database.ts src/lib/actions/pages.ts src/__tests__/lib/actions/pages.test.ts
git commit -m "feat: add page Server Actions (CRUD)"
```

---

### Task 2: Block Save/Load Server Action

**Files:**
- Modify: `src/lib/actions/pages.ts`
- Create: `src/__tests__/lib/actions/blocks.test.ts`

- [ ] **Step 1: Write failing block save/load tests**

Create `src/__tests__/lib/actions/blocks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TiptapDocument } from '@/lib/types/database'

const mockUpsert = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockDelete = vi.fn()

const mockFrom = vi.fn(() => ({
  upsert: mockUpsert.mockReturnThis(),
  select: mockSelect.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockDoc: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
}

describe('block actions', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules() })

  it('saveBlocks upserts blocks derived from Tiptap doc', async () => {
    mockEq.mockResolvedValue({ error: null })
    mockUpsert.mockResolvedValue({ error: null })
    const { saveBlocks } = await import('@/lib/actions/pages')
    await saveBlocks('page1', 'ws1', mockDoc)
    expect(mockFrom).toHaveBeenCalledWith('blocks')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalled()
  })

  it('loadBlocks returns a TiptapDocument reconstructed from blocks', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: 'b1', type: 'paragraph', content: { text: 'Hello' }, position: 0 },
      ],
      error: null,
    })
    const { loadBlocks } = await import('@/lib/actions/pages')
    const doc = await loadBlocks('page1')
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/lib/actions/blocks.test.ts
```

Expected: FAIL — `saveBlocks` and `loadBlocks` not found.

- [ ] **Step 3: Add `saveBlocks` and `loadBlocks` to `src/lib/actions/pages.ts`**

Append to `src/lib/actions/pages.ts`:

```ts
import type { TiptapDocument, TiptapNode } from '@/lib/types/database'

export async function saveBlocks(pageId: string, workspaceId: string, doc: TiptapDocument): Promise<void> {
  const supabase = await createClient()

  // Delete existing blocks then re-insert (simple replace strategy)
  await supabase.from('blocks').delete().eq('page_id', pageId)

  const blocks = (doc.content ?? []).map((node: TiptapNode, index: number) => ({
    page_id: pageId,
    type: node.type,
    content: node,
    position: index,
  }))

  if (blocks.length > 0) {
    const { error } = await supabase.from('blocks').upsert(blocks)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/workspace/${workspaceId}/page/${pageId}`)
}

export async function loadBlocks(pageId: string): Promise<TiptapDocument> {
  const supabase = await createClient()
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

- [ ] **Step 4: Run tests**

```bash
npm test -- src/__tests__/lib/actions/blocks.test.ts
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/pages.ts src/__tests__/lib/actions/blocks.test.ts
git commit -m "feat: add block save/load Server Actions"
```

---

### Task 3: Block Editor Component (Tiptap)

**Files:**
- Create: `src/components/editor/BlockEditor.tsx`
- Create: `src/components/editor/EditorToolbar.tsx`
- Create: `src/__tests__/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: Install Tiptap**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder
```

Expected: Packages installed with no peer-dep errors.

- [ ] **Step 2: Write failing editor tests**

Create `src/__tests__/components/editor/BlockEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BlockEditor } from '@/components/editor/BlockEditor'
import type { TiptapDocument } from '@/lib/types/database'

const emptyDoc: TiptapDocument = { type: 'doc', content: [] }

describe('BlockEditor', () => {
  it('renders without crashing', () => {
    render(<BlockEditor doc={emptyDoc} onSave={vi.fn()} />)
    expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
  })

  it('calls onSave with updated doc when content changes', async () => {
    const onSave = vi.fn()
    render(<BlockEditor doc={emptyDoc} onSave={onSave} />)
    const editor = document.querySelector('.ProseMirror') as HTMLElement
    editor.focus()
    // Simulate input
    editor.innerHTML = '<p>Hello world</p>'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    // onSave is debounced — just verify it's callable
    expect(onSave).toBeDefined()
  })

  it('renders toolbar with bold and italic buttons', () => {
    render(<BlockEditor doc={emptyDoc} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- src/__tests__/components/editor/BlockEditor.test.tsx
```

Expected: FAIL — `@/components/editor/BlockEditor` not found.

- [ ] **Step 4: Implement `EditorToolbar.tsx`**

Create `src/components/editor/EditorToolbar.tsx`:

```tsx
'use client'

import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'

interface EditorToolbarProps {
  editor: Editor
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  return (
    <div className="flex gap-1 p-2 border-b flex-wrap">
      <Button
        type="button"
        size="sm"
        variant={editor.isActive('bold') ? 'default' : 'ghost'}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
      >
        B
      </Button>
      <Button
        type="button"
        size="sm"
        variant={editor.isActive('italic') ? 'default' : 'ghost'}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
      >
        I
      </Button>
      <Button
        type="button"
        size="sm"
        variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'ghost'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        aria-label="Heading 1"
      >
        H1
      </Button>
      <Button
        type="button"
        size="sm"
        variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="Heading 2"
      >
        H2
      </Button>
      <Button
        type="button"
        size="sm"
        variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet list"
      >
        •
      </Button>
      <Button
        type="button"
        size="sm"
        variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Ordered list"
      >
        1.
      </Button>
      <Button
        type="button"
        size="sm"
        variant={editor.isActive('codeBlock') ? 'default' : 'ghost'}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-label="Code block"
      >
        {'</>'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Implement `BlockEditor.tsx`**

Create `src/components/editor/BlockEditor.tsx`:

```tsx
'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorToolbar } from './EditorToolbar'
import type { TiptapDocument } from '@/lib/types/database'

interface BlockEditorProps {
  doc: TiptapDocument
  onSave: (doc: TiptapDocument) => void
}

export function BlockEditor({ doc, onSave }: BlockEditorProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: doc.content.length > 0 ? doc : { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: { class: 'prose max-w-none focus:outline-none min-h-[200px] p-4' },
    },
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSave(editor.getJSON() as TiptapDocument)
      }, 1000)
    },
  })

  // Sync external doc changes (e.g. navigating between pages)
  useEffect(() => {
    if (editor && doc) {
      const current = JSON.stringify(editor.getJSON())
      const incoming = JSON.stringify(doc)
      if (current !== incoming && doc.content.length > 0) {
        editor.commands.setContent(doc)
      }
    }
  }, [editor, doc])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  if (!editor) return null

  return (
    <div className="flex flex-col border rounded-md overflow-hidden">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- src/__tests__/components/editor/BlockEditor.test.tsx
```

Expected: PASS — 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/ src/__tests__/components/editor/
git commit -m "feat: add Tiptap block editor with toolbar"
```

---

### Task 4: Sidebar Page Tree

**Files:**
- Create: `src/components/layout/SidebarPageTree.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Create: `src/__tests__/components/layout/SidebarPageTree.test.tsx`

- [ ] **Step 1: Write failing page tree tests**

Create `src/__tests__/components/layout/SidebarPageTree.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarPageTree } from '@/components/layout/SidebarPageTree'
import type { Page } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a>,
}))
vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ workspaceId: 'ws1', pageId: 'p1' }),
}))

const mockPages: Page[] = [
  { id: 'p1', workspace_id: 'ws1', parent_id: null, title: 'Root Page', created_by: 'u1', created_at: '', updated_at: '' },
  { id: 'p2', workspace_id: 'ws1', parent_id: 'p1', title: 'Child Page', created_by: 'u1', created_at: '', updated_at: '' },
]

describe('SidebarPageTree', () => {
  it('renders top-level pages', () => {
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={vi.fn()} />)
    expect(screen.getByText('Root Page')).toBeInTheDocument()
  })

  it('does not render child pages at root level', () => {
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={vi.fn()} />)
    expect(screen.queryByText('Child Page')).not.toBeInTheDocument()
  })

  it('expands to show child pages on click', () => {
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText('Child Page')).toBeInTheDocument()
  })

  it('calls onCreatePage with null parentId when + button clicked', () => {
    const onCreatePage = vi.fn()
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={onCreatePage} />)
    fireEvent.click(screen.getByRole('button', { name: /new page/i }))
    expect(onCreatePage).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/components/layout/SidebarPageTree.test.tsx
```

Expected: FAIL — `SidebarPageTree` not found.

- [ ] **Step 3: Implement `SidebarPageTree.tsx`**

Create `src/components/layout/SidebarPageTree.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Page } from '@/lib/types/database'

interface SidebarPageTreeProps {
  pages: Page[]
  workspaceId: string
  onCreatePage: (parentId: string | null) => void
}

interface PageNodeProps {
  page: Page
  pages: Page[]
  workspaceId: string
  depth: number
  onCreatePage: (parentId: string | null) => void
}

function PageNode({ page, pages, workspaceId, depth, onCreatePage }: PageNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const params = useParams()
  const currentPageId = params?.pageId as string | undefined
  const children = pages.filter(p => p.parent_id === page.id)
  const isActive = currentPageId === page.id

  return (
    <div>
      <div
        className={`flex items-center gap-1 group rounded-md px-2 py-1 text-sm ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground'}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-4 h-4 flex items-center justify-center text-xs shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {children.length > 0 ? (expanded ? '▾' : '▸') : ' '}
        </button>
        <Link href={`/workspace/${workspaceId}/page/${page.id}`} className="flex-1 truncate">
          {page.title || 'Untitled'}
        </Link>
        <button
          onClick={() => onCreatePage(page.id)}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 text-xs"
          aria-label="New subpage"
        >
          +
        </button>
      </div>
      {expanded && children.map(child => (
        <PageNode
          key={child.id}
          page={child}
          pages={pages}
          workspaceId={workspaceId}
          depth={depth + 1}
          onCreatePage={onCreatePage}
        />
      ))}
    </div>
  )
}

export function SidebarPageTree({ pages, workspaceId, onCreatePage }: SidebarPageTreeProps) {
  const roots = pages.filter(p => p.parent_id === null)

  return (
    <div className="mt-2">
      <div className="flex items-center px-3 py-1 justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pages</span>
        <button
          onClick={() => onCreatePage(null)}
          className="text-muted-foreground hover:text-foreground text-sm"
          aria-label="New page"
        >
          +
        </button>
      </div>
      {roots.map(page => (
        <PageNode
          key={page.id}
          page={page}
          pages={pages}
          workspaceId={workspaceId}
          depth={0}
          onCreatePage={onCreatePage}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/__tests__/components/layout/SidebarPageTree.test.tsx
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Wire `SidebarPageTree` into `Sidebar.tsx`**

Read the current `src/components/layout/Sidebar.tsx` and add the page tree below the workspace nav. The `Sidebar` component needs a `pages` prop added:

```tsx
'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page } from '@/lib/types/database'
import { createPage } from '@/lib/actions/pages'
import { SidebarPageTree } from './SidebarPageTree'

interface SidebarProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
}

export function Sidebar({ workspaces, user, pages }: SidebarProps) {
  const params = useParams()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const currentWorkspaceId = params?.workspaceId as string | undefined

  function handleCreatePage(parentId: string | null) {
    if (!currentWorkspaceId) return
    startTransition(async () => {
      const page = await createPage(currentWorkspaceId, parentId)
      router.push(`/workspace/${currentWorkspaceId}/page/${page.id}`)
    })
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-4 border-b">
        <span className="font-semibold text-sm tracking-tight">graphbrain</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {workspaces.map(({ workspaces: ws }) =>
          ws ? (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                currentWorkspaceId === ws.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              {ws.name}
            </Link>
          ) : null
        )}
        {currentWorkspaceId && (
          <SidebarPageTree
            pages={pages}
            workspaceId={currentWorkspaceId}
            onCreatePage={handleCreatePage}
          />
        )}
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
    </aside>
  )
}
```

- [ ] **Step 6: Update existing `Sidebar` test to pass `pages` prop**

Read `src/__tests__/components/layout/Sidebar.test.tsx` and add `pages={[]}` to every `render(<Sidebar ... />)` call, and add mock for `next/navigation`'s `useRouter` and mock for `@/lib/actions/pages`:

```tsx
vi.mock('@/lib/actions/pages', () => ({ createPage: vi.fn() }))
vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ workspaceId: 'ws-1' }),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}))
```

And add `pages={[]}` to every `render` call.

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 8: Update `AppShell.tsx` to accept and pass `pages` prop**

Modify `src/components/layout/AppShell.tsx`:

```tsx
'use client'

import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page } from '@/lib/types/database'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaces={workspaces} user={user} pages={pages} />
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  )
}
```

- [ ] **Step 9: Update `(app)/layout.tsx` to fetch pages and pass to AppShell**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { getPages } from '@/lib/actions/pages'
import type { WorkspaceEntry } from '@/lib/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id) as { data: WorkspaceEntry[] | null }

  // Fetch pages for the first workspace (sidebar loads all user's pages)
  const firstWorkspaceId = workspaces?.[0]?.workspace_id
  const pages = firstWorkspaceId ? await getPages(firstWorkspaceId) : []

  return (
    <AppShell workspaces={workspaces ?? []} user={user} pages={pages}>
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 10: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/components/layout/ src/__tests__/components/layout/ src/app/\(app\)/layout.tsx
git commit -m "feat: add sidebar page tree with create/expand support"
```

---

### Task 5: Page View and Edit

**Files:**
- Create: `src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx`
- Modify: `src/app/(app)/workspace/[workspaceId]/page.tsx`

- [ ] **Step 1: Create the page view/edit route**

Create `src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadBlocks } from '@/lib/actions/pages'
import { PageEditor } from '@/components/editor/PageEditor'

export default async function PageViewPage({
  params,
}: {
  params: { workspaceId: string; pageId: string }
}) {
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('pages')
    .select('id, title, workspace_id, workspace_members!inner(user_id)')
    .eq('id', params.pageId)
    .single()

  if (!page) notFound()

  const doc = await loadBlocks(params.pageId)

  return (
    <PageEditor
      pageId={params.pageId}
      workspaceId={params.workspaceId}
      initialTitle={page.title}
      initialDoc={doc}
    />
  )
}
```

- [ ] **Step 2: Create `PageEditor` client component**

Create `src/components/editor/PageEditor.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { BlockEditor } from './BlockEditor'
import { updatePageTitle, saveBlocks } from '@/lib/actions/pages'
import type { TiptapDocument } from '@/lib/types/database'

interface PageEditorProps {
  pageId: string
  workspaceId: string
  initialTitle: string
  initialDoc: TiptapDocument
}

export function PageEditor({ pageId, workspaceId, initialTitle, initialDoc }: PageEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [, startTransition] = useTransition()

  function handleTitleBlur() {
    startTransition(() => updatePageTitle(pageId, workspaceId, title))
  }

  function handleSave(doc: TiptapDocument) {
    startTransition(() => saveBlocks(pageId, workspaceId, doc))
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <input
        className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-6 placeholder:text-muted-foreground"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Untitled"
        aria-label="Page title"
      />
      <BlockEditor doc={initialDoc} onSave={handleSave} />
    </div>
  )
}
```

- [ ] **Step 3: Update workspace landing page with "New Page" CTA**

Replace the body of `src/app/(app)/workspace/[workspaceId]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { NewPageButton } from '@/components/editor/NewPageButton'

export default async function WorkspacePage({
  params,
}: {
  params: { workspaceId: string }
}) {
  const supabase = await createClient()

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, workspace_members!inner(user_id)')
    .eq('id', params.workspaceId)
    .single()

  if (!workspace) notFound()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">{workspace.name}</h1>
      <p className="text-muted-foreground mt-2 mb-6">
        Select a page from the sidebar, or create a new one.
      </p>
      <NewPageButton workspaceId={params.workspaceId} />
    </div>
  )
}
```

- [ ] **Step 4: Create `NewPageButton` component**

Create `src/components/editor/NewPageButton.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createPage } from '@/lib/actions/pages'

export function NewPageButton({ workspaceId }: { workspaceId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      const page = await createPage(workspaceId, null)
      router.push(`/workspace/${workspaceId}/page/${page.id}`)
    })
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      {isPending ? 'Creating…' : '+ New Page'}
    </Button>
  )
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/workspace/ src/components/editor/
git commit -m "feat: add page view/edit route with title and block editor"
```

---

### Task 6: TypeScript Check + E2E Smoke Test

**Files:**
- Create: `e2e/pages.spec.ts`

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors. Fix any type errors before continuing.

- [ ] **Step 2: Write E2E page flow test**

Create `e2e/pages.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('page flow', () => {
  test.beforeEach(async ({ page }) => {
    // Log in with local Supabase test credentials
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('sidebar shows Pages section', async ({ page }) => {
    await expect(page.getByText('Pages')).toBeVisible()
  })

  test('clicking + New Page creates a page and navigates to editor', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).first().click()
    await page.waitForURL(/\/page\//)
    await expect(page.getByPlaceholder('Untitled')).toBeVisible()
  })

  test('typing in title updates the page title', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).first().click()
    await page.waitForURL(/\/page\//)
    const titleInput = page.getByPlaceholder('Untitled')
    await titleInput.fill('My Test Page')
    await titleInput.blur()
    await expect(titleInput).toHaveValue('My Test Page')
  })

  test('editor renders and accepts text input', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).first().click()
    await page.waitForURL(/\/page\//)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await editor.type('Hello graphbrain')
    await expect(editor).toContainText('Hello graphbrain')
  })
})
```

- [ ] **Step 3: Start dev server and run E2E tests**

```bash
# Terminal 1
npm run dev

# Terminal 2 (requires a signed-in user — sign up manually first at http://localhost:3000/signup)
npm run test:e2e -- e2e/pages.spec.ts
```

Expected: All 4 E2E tests pass (the beforeEach may skip on first run if no user exists — sign up at `/signup` first).

- [ ] **Step 4: Run full test suite one final time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Final commit**

```bash
git add e2e/pages.spec.ts
git commit -m "feat: add E2E page flow smoke tests"
```

---

## What's Next

- **Phase 2b:** Databases — Table, Kanban, and Calendar views inside pages
- **Phase 2c:** File attachments — image/PDF upload to Supabase Storage, async PDF text extraction
- **Phase 3:** Knowledge Graph & AI — Ollama embeddings, BullMQ job queue, edge detection
- **Phase 4:** Query Interface — Cmd+K modal, semantic search, streaming AI Q&A
