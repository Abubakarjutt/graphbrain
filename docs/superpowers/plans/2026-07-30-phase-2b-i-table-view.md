# Phase 2b-i: Table View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Notion-style databases with a Table view — each row is a full page, sidebar shows a Databases section, rows open in the existing page editor with a properties panel.

**Architecture:** A `databases` table links to a container `pages` record; each row in `database_rows` links to its own `pages` record (created atomically). The sidebar fetches databases via their container page IDs and filters them out of the regular pages section. Route `/workspace/[workspaceId]/database/[databaseId]` renders `DatabaseShell` → `TableView`.

**Tech Stack:** Next.js 16 App Router (server + client components), Supabase (Postgres + RLS), TypeScript strict, Tailwind CSS v4, Vitest + jsdom for unit tests, Playwright for E2E.

---

## File Map

| Action | Path |
|--------|------|
| Create | `supabase/migrations/20260730000001_database_rows_page_id.sql` |
| Modify | `src/lib/types/database.ts` |
| Create | `src/lib/actions/databases.ts` |
| Create | `src/__tests__/lib/actions/databases.test.ts` |
| Create | `src/components/database/DatabaseShell.tsx` |
| Create | `src/components/database/SchemaEditor.tsx` |
| Create | `src/components/database/TableView.tsx` |
| Create | `src/components/database/PropertiesPanel.tsx` |
| Create | `src/components/layout/SidebarDatabaseTree.tsx` |
| Modify | `src/components/layout/Sidebar.tsx` |
| Modify | `src/components/layout/AppShell.tsx` |
| Modify | `src/app/(app)/layout.tsx` |
| Create | `src/app/(app)/workspace/[workspaceId]/database/[databaseId]/page.tsx` |
| Modify | `src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx` |
| Create | `e2e/databases.spec.ts` |

---

## Task 1: Migration and Type Updates

**Files:**
- Create: `supabase/migrations/20260730000001_database_rows_page_id.sql`
- Modify: `src/lib/types/database.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260730000001_database_rows_page_id.sql
alter table database_rows
  add column page_id uuid references pages(id) on delete set null;

create index database_rows_page_idx on database_rows (page_id);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or apply manually in your Supabase dashboard SQL editor)

Expected: no errors; `database_rows` table now has a nullable `page_id` column.

- [ ] **Step 3: Update types in `src/lib/types/database.ts`**

Replace the existing `DatabaseRow` interface and add two new interfaces:

```ts
export interface DatabaseRow {
  id: string
  database_id: string
  page_id: string | null
  fields: Record<string, unknown>
  created_at: string
}

export interface DatabaseRowWithTitle extends DatabaseRow {
  page_title: string
}

export interface DatabaseWithRows {
  id: string
  page_id: string
  schema: DatabaseField[]
  created_at: string
  rows: DatabaseRowWithTitle[]
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260730000001_database_rows_page_id.sql src/lib/types/database.ts
git commit -m "feat: add page_id to database_rows and update types"
```

---

## Task 2: Server Actions — Database Creation and Retrieval (TDD)

**Files:**
- Create: `src/__tests__/lib/actions/databases.test.ts` (write first)
- Create: `src/lib/actions/databases.ts`

- [ ] **Step 1: Write the failing tests for createDatabase and getDatabase**

Create `src/__tests__/lib/actions/databases.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── pages table ──────────────────────────────────────────────────
const mockPagesSingle = vi.fn()
const mockPagesSelectEq2 = vi.fn(() => ({ single: mockPagesSingle }))
const mockPagesSelectEq1 = vi.fn(() => ({ eq: mockPagesSelectEq2, single: mockPagesSingle }))
const mockPagesIn = vi.fn().mockResolvedValue({ data: [], error: null })
const mockPagesSelectChain = vi.fn(() => ({ eq: mockPagesSelectEq1, in: mockPagesIn }))
const mockPagesInsertSingle = vi.fn()
const mockPagesInsertSelect = vi.fn(() => ({ single: mockPagesInsertSingle }))
const mockPagesInsert = vi.fn(() => ({ select: mockPagesInsertSelect }))
const mockPagesDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockPagesDelete = vi.fn(() => ({ eq: mockPagesDeleteEq }))

// ── databases table ───────────────────────────────────────────────
const mockDbSingle = vi.fn()
const mockDbEq = vi.fn(() => ({ single: mockDbSingle }))
const mockDbSelect = vi.fn(() => ({ eq: mockDbEq }))
const mockDbInsertSingle = vi.fn()
const mockDbInsertSelect = vi.fn(() => ({ single: mockDbInsertSingle }))
const mockDbInsert = vi.fn(() => ({ select: mockDbInsertSelect }))
const mockDbUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockDbUpdate = vi.fn(() => ({ eq: mockDbUpdateEq }))

// ── database_rows table ───────────────────────────────────────────
const mockRowSingle = vi.fn()
const mockRowOrder = vi.fn().mockResolvedValue({ data: [], error: null })
const mockRowSelectEq2 = vi.fn(() => ({ single: mockRowSingle, order: mockRowOrder }))
const mockRowSelectEq1 = vi.fn(() => ({ eq: mockRowSelectEq2 }))
const mockRowSelect = vi.fn(() => ({ eq: mockRowSelectEq1 }))
const mockRowInsertSingle = vi.fn()
const mockRowInsertSelect = vi.fn(() => ({ single: mockRowInsertSingle }))
const mockRowInsert = vi.fn(() => ({ select: mockRowInsertSelect }))
const mockRowUpdateEq2 = vi.fn().mockResolvedValue({ error: null })
const mockRowUpdateEq1 = vi.fn(() => ({ eq: mockRowUpdateEq2 }))
const mockRowUpdate = vi.fn(() => ({ eq: mockRowUpdateEq1 }))
const mockRowDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockRowDelete = vi.fn(() => ({ eq: mockRowDeleteEq }))

const mockFrom = vi.fn((table: string) => {
  switch (table) {
    case 'pages': return { select: mockPagesSelectChain, insert: mockPagesInsert, delete: mockPagesDelete }
    case 'databases': return { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate }
    case 'database_rows': return { select: mockRowSelect, insert: mockRowInsert, update: mockRowUpdate, delete: mockRowDelete }
    default: return {}
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('database actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockPagesDeleteEq.mockResolvedValue({ error: null })
    mockPagesDelete.mockImplementation(() => ({ eq: mockPagesDeleteEq }))
    mockPagesSelectEq2.mockImplementation(() => ({ single: mockPagesSingle }))
    mockPagesSelectEq1.mockImplementation(() => ({ eq: mockPagesSelectEq2, single: mockPagesSingle }))
    mockPagesSelectChain.mockImplementation(() => ({ eq: mockPagesSelectEq1, in: mockPagesIn }))
    mockPagesInsertSelect.mockImplementation(() => ({ single: mockPagesInsertSingle }))
    mockPagesInsert.mockImplementation(() => ({ select: mockPagesInsertSelect }))
    mockDbEq.mockImplementation(() => ({ single: mockDbSingle }))
    mockDbSelect.mockImplementation(() => ({ eq: mockDbEq }))
    mockDbInsertSelect.mockImplementation(() => ({ single: mockDbInsertSingle }))
    mockDbInsert.mockImplementation(() => ({ select: mockDbInsertSelect }))
    mockDbUpdateEq.mockResolvedValue({ error: null })
    mockDbUpdate.mockImplementation(() => ({ eq: mockDbUpdateEq }))
    mockRowOrder.mockResolvedValue({ data: [], error: null })
    mockRowSelectEq2.mockImplementation(() => ({ single: mockRowSingle, order: mockRowOrder }))
    mockRowSelectEq1.mockImplementation(() => ({ eq: mockRowSelectEq2 }))
    mockRowSelect.mockImplementation(() => ({ eq: mockRowSelectEq1 }))
    mockRowInsertSelect.mockImplementation(() => ({ single: mockRowInsertSingle }))
    mockRowInsert.mockImplementation(() => ({ select: mockRowInsertSelect }))
    mockRowUpdateEq2.mockResolvedValue({ error: null })
    mockRowUpdateEq1.mockImplementation(() => ({ eq: mockRowUpdateEq2 }))
    mockRowUpdate.mockImplementation(() => ({ eq: mockRowUpdateEq1 }))
    mockRowDeleteEq.mockResolvedValue({ error: null })
    mockRowDelete.mockImplementation(() => ({ eq: mockRowDeleteEq }))
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'pages': return { select: mockPagesSelectChain, insert: mockPagesInsert, delete: mockPagesDelete }
        case 'databases': return { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate }
        case 'database_rows': return { select: mockRowSelect, insert: mockRowInsert, update: mockRowUpdate, delete: mockRowDelete }
        default: return {}
      }
    })
  })

  it('createDatabase creates a page and a database record', async () => {
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Untitled Database', workspace_id: 'ws1', parent_id: null, created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockDbInsertSingle.mockResolvedValue({
      data: { id: 'db1', page_id: 'p1', schema: [], created_at: '' },
      error: null,
    })
    const { createDatabase } = await import('@/lib/actions/databases')
    const result = await createDatabase('ws1')
    expect(mockPagesInsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'ws1', title: 'Untitled Database' }))
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ page_id: 'p1', schema: [] }))
    expect(result.database.id).toBe('db1')
    expect(result.pageId).toBe('p1')
  })

  it('createDatabase rolls back the page if database insert fails', async () => {
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Untitled Database', workspace_id: 'ws1', parent_id: null, created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockDbInsertSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const { createDatabase } = await import('@/lib/actions/databases')
    await expect(createDatabase('ws1')).rejects.toThrow('DB error')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p1')
  })

  it('getDatabase throws when container page is not in the workspace', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p1', schema: [], created_at: '' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: null, error: null })
    const { getDatabase } = await import('@/lib/actions/databases')
    await expect(getDatabase('db1', 'wrong-ws')).rejects.toThrow('Database not found or access denied')
  })
})
```

- [ ] **Step 2: Run the tests — expect FAIL (module not found)**

Run: `npx vitest run src/__tests__/lib/actions/databases.test.ts`
Expected: FAIL — `Cannot find module '@/lib/actions/databases'`

- [ ] **Step 3: Create `src/lib/actions/databases.ts` with createDatabase and getDatabase**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Database, DatabaseField, DatabaseWithRows, DatabaseRowWithTitle } from '@/lib/types/database'

export async function createDatabase(workspaceId: string): Promise<{ database: Database; pageId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: page, error: pageError } = await supabase
    .from('pages')
    .insert({ workspace_id: workspaceId, title: 'Untitled Database', created_by: user.id })
    .select()
    .single()
  if (pageError || !page) throw new Error(pageError?.message ?? 'Failed to create page')

  const { data: database, error: dbError } = await supabase
    .from('databases')
    .insert({ page_id: page.id, schema: [] })
    .select()
    .single()
  if (dbError || !database) {
    await supabase.from('pages').delete().eq('id', page.id)
    throw new Error(dbError?.message ?? 'Failed to create database')
  }

  revalidatePath(`/workspace/${workspaceId}`)
  return { database: database as Database, pageId: page.id }
}

export async function getDatabase(databaseId: string, workspaceId: string): Promise<DatabaseWithRows> {
  const supabase = await createClient()

  const { data: db, error: dbError } = await supabase
    .from('databases')
    .select('id, page_id, schema, created_at')
    .eq('id', databaseId)
    .single()
  if (dbError || !db) throw new Error('Database not found')

  const { data: containerPage } = await supabase
    .from('pages')
    .select('id, workspace_id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')

  const { data: rows, error: rowsError } = await supabase
    .from('database_rows')
    .select('id, database_id, page_id, fields, created_at')
    .eq('database_id', databaseId)
    .order('created_at', { ascending: true })
  if (rowsError) throw new Error(rowsError.message)

  const pageIds = (rows ?? []).map((r: { page_id: string | null }) => r.page_id).filter(Boolean) as string[]
  const pageTitles: Record<string, string> = {}
  if (pageIds.length > 0) {
    const { data: rowPages } = await supabase
      .from('pages')
      .select('id, title')
      .in('id', pageIds)
    for (const p of rowPages ?? []) pageTitles[p.id] = p.title
  }

  return {
    id: db.id,
    page_id: db.page_id,
    schema: db.schema as DatabaseField[],
    created_at: db.created_at,
    rows: (rows ?? []).map((r: { id: string; database_id: string; page_id: string | null; fields: unknown; created_at: string }) => ({
      id: r.id,
      database_id: r.database_id,
      page_id: r.page_id,
      fields: r.fields as Record<string, unknown>,
      created_at: r.created_at,
      page_title: r.page_id ? (pageTitles[r.page_id] ?? 'Untitled') : 'Untitled',
    })),
  }
}
```

- [ ] **Step 4: Run tests — expect PASS for the 3 tests so far**

Run: `npx vitest run src/__tests__/lib/actions/databases.test.ts`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/lib/actions/databases.test.ts src/lib/actions/databases.ts
git commit -m "feat: add createDatabase and getDatabase server actions with tests"
```

---

## Task 3: Server Actions — Row CRUD (TDD)

**Files:**
- Modify: `src/__tests__/lib/actions/databases.test.ts` (add tests)
- Modify: `src/lib/actions/databases.ts` (add functions)

- [ ] **Step 1: Add failing tests for createRow, updateRowFields, updateDatabaseSchema, deleteRow**

Append these tests inside the existing `describe('database actions', ...)` block in `src/__tests__/lib/actions/databases.test.ts`:

```ts
  it('createRow atomically creates a page and a database row', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p-row', title: 'Untitled', workspace_id: 'ws1', parent_id: 'p-container', created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockRowInsertSingle.mockResolvedValue({
      data: { id: 'row1', database_id: 'db1', page_id: 'p-row', fields: {}, created_at: '' },
      error: null,
    })
    const { createRow } = await import('@/lib/actions/databases')
    const row = await createRow('db1', 'ws1')
    expect(mockPagesInsert).toHaveBeenCalledWith(expect.objectContaining({ parent_id: 'p-container', workspace_id: 'ws1' }))
    expect(mockRowInsert).toHaveBeenCalledWith(expect.objectContaining({ database_id: 'db1', page_id: 'p-row' }))
    expect(row.id).toBe('row1')
    expect(row.page_id).toBe('p-row')
    expect(row.page_title).toBe('Untitled')
  })

  it('createRow rolls back the page if row insert fails', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p-row', title: 'Untitled', workspace_id: 'ws1', parent_id: 'p-container', created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockRowInsertSingle.mockResolvedValue({ data: null, error: { message: 'Row error' } })
    const { createRow } = await import('@/lib/actions/databases')
    await expect(createRow('db1', 'ws1')).rejects.toThrow('Row error')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p-row')
  })

  it('updateRowFields updates fields with correct row and database IDs', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    const { updateRowFields } = await import('@/lib/actions/databases')
    await updateRowFields('row1', 'db1', 'ws1', { fieldA: 'value' })
    expect(mockRowUpdate).toHaveBeenCalledWith({ fields: { fieldA: 'value' } })
    expect(mockRowUpdateEq1).toHaveBeenCalledWith('id', 'row1')
    expect(mockRowUpdateEq2).toHaveBeenCalledWith('database_id', 'db1')
  })

  it('deleteRow deletes the row then its linked page', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    mockRowSingle.mockResolvedValue({ data: { id: 'row1', page_id: 'p-row' }, error: null })
    const { deleteRow } = await import('@/lib/actions/databases')
    await deleteRow('row1', 'db1', 'ws1')
    expect(mockRowDeleteEq).toHaveBeenCalledWith('id', 'row1')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p-row')
  })
```

- [ ] **Step 2: Run tests — expect 4 new FAILs (functions not exported yet)**

Run: `npx vitest run src/__tests__/lib/actions/databases.test.ts`
Expected: 3 PASS (existing), 4 FAIL (new tests — function not defined)

- [ ] **Step 3: Add the remaining functions to `src/lib/actions/databases.ts`**

Append to the end of `src/lib/actions/databases.ts`:

```ts
export async function updateDatabaseSchema(
  databaseId: string,
  workspaceId: string,
  schema: DatabaseField[]
): Promise<void> {
  const supabase = await createClient()

  const { data: db } = await supabase
    .from('databases')
    .select('id, page_id')
    .eq('id', databaseId)
    .single()
  if (!db) throw new Error('Database not found')

  const { data: containerPage } = await supabase
    .from('pages')
    .select('id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')

  const { error } = await supabase
    .from('databases')
    .update({ schema })
    .eq('id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function createRow(
  databaseId: string,
  workspaceId: string,
  initialFields?: Record<string, unknown>
): Promise<DatabaseRowWithTitle> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: db } = await supabase
    .from('databases')
    .select('id, page_id')
    .eq('id', databaseId)
    .single()
  if (!db) throw new Error('Database not found')

  const { data: containerPage } = await supabase
    .from('pages')
    .select('id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')

  const { data: page, error: pageError } = await supabase
    .from('pages')
    .insert({ workspace_id: workspaceId, parent_id: db.page_id, title: 'Untitled', created_by: user.id })
    .select()
    .single()
  if (pageError || !page) throw new Error(pageError?.message ?? 'Failed to create row page')

  const { data: row, error: rowError } = await supabase
    .from('database_rows')
    .insert({ database_id: databaseId, page_id: page.id, fields: initialFields ?? {} })
    .select()
    .single()
  if (rowError || !row) {
    await supabase.from('pages').delete().eq('id', page.id)
    throw new Error(rowError?.message ?? 'Failed to create row')
  }

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return {
    id: row.id,
    database_id: row.database_id,
    page_id: page.id,
    fields: row.fields as Record<string, unknown>,
    created_at: row.created_at,
    page_title: 'Untitled',
  }
}

export async function updateRowFields(
  rowId: string,
  databaseId: string,
  workspaceId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient()

  const { data: db } = await supabase
    .from('databases')
    .select('id, page_id')
    .eq('id', databaseId)
    .single()
  if (!db) throw new Error('Database not found')

  const { data: containerPage } = await supabase
    .from('pages')
    .select('id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')

  const { error } = await supabase
    .from('database_rows')
    .update({ fields })
    .eq('id', rowId)
    .eq('database_id', databaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}

export async function deleteRow(
  rowId: string,
  databaseId: string,
  workspaceId: string
): Promise<void> {
  const supabase = await createClient()

  const { data: db } = await supabase
    .from('databases')
    .select('id, page_id')
    .eq('id', databaseId)
    .single()
  if (!db) throw new Error('Database not found')

  const { data: containerPage } = await supabase
    .from('pages')
    .select('id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')

  const { data: row } = await supabase
    .from('database_rows')
    .select('id, page_id')
    .eq('id', rowId)
    .eq('database_id', databaseId)
    .single()
  if (!row) throw new Error('Row not found')

  const { error } = await supabase
    .from('database_rows')
    .delete()
    .eq('id', rowId)
  if (error) throw new Error(error.message)

  if (row.page_id) {
    await supabase.from('pages').delete().eq('id', row.page_id)
  }

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
}
```

- [ ] **Step 4: Run all tests — expect 7 PASS**

Run: `npx vitest run src/__tests__/lib/actions/databases.test.ts`
Expected: 7 PASS, 0 FAIL

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/lib/actions/databases.test.ts src/lib/actions/databases.ts
git commit -m "feat: add createRow, updateRowFields, updateDatabaseSchema, deleteRow server actions"
```

---

## Task 4: SidebarDatabaseTree and Sidebar/Layout Wiring

**Files:**
- Create: `src/components/layout/SidebarDatabaseTree.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `src/components/layout/SidebarDatabaseTree.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Database, Page } from '@/lib/types/database'

interface SidebarDatabaseTreeProps {
  databases: Database[]
  pages: Page[]
  workspaceId: string
  onCreateDatabase: () => void
}

export function SidebarDatabaseTree({ databases, pages, workspaceId, onCreateDatabase }: SidebarDatabaseTreeProps) {
  const params = useParams()
  const currentDatabaseId = params?.databaseId as string | undefined

  const workspaceDatabases = databases.filter(d => {
    const containerPage = pages.find(p => p.id === d.page_id)
    return containerPage?.workspace_id === workspaceId
  })

  return (
    <div className="mt-2">
      <div className="flex items-center px-3 py-1 justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Databases</span>
        <button
          onClick={onCreateDatabase}
          className="text-muted-foreground hover:text-foreground text-sm"
          aria-label="New database"
        >
          +
        </button>
      </div>
      {workspaceDatabases.map(db => {
        const containerPage = pages.find(p => p.id === db.page_id)
        const rowPages = pages.filter(p => p.parent_id === db.page_id)
        const isActive = currentDatabaseId === db.id
        return (
          <div key={db.id}>
            <Link
              href={`/workspace/${workspaceId}/database/${db.id}`}
              className={`flex items-center rounded-md px-3 py-1 text-sm ${
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              {containerPage?.title || 'Untitled Database'}
            </Link>
            {rowPages.map(rp => (
              <Link
                key={rp.id}
                href={`/workspace/${workspaceId}/page/${rp.id}`}
                className="flex items-center rounded-md text-sm hover:bg-accent/50 text-muted-foreground"
                style={{ paddingLeft: '24px', paddingTop: '4px', paddingBottom: '4px', paddingRight: '8px' }}
              >
                {rp.title || 'Untitled'}
              </Link>
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update `src/app/(app)/layout.tsx` to fetch databases**

Replace the entire file with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
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

  return (
    <AppShell workspaces={workspaces ?? []} user={user} pages={pages} databases={databases}>
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 3: Update `src/components/layout/AppShell.tsx` to accept and forward databases**

Replace the entire file with:

```tsx
'use client'

import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, databases, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaces={workspaces} user={user} pages={pages} databases={databases} />
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Update `src/components/layout/Sidebar.tsx` to add databases section**

Replace the entire file with:

```tsx
'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'
import { createPage } from '@/lib/actions/pages'
import { createDatabase } from '@/lib/actions/databases'
import { SidebarPageTree } from './SidebarPageTree'
import { SidebarDatabaseTree } from './SidebarDatabaseTree'

interface SidebarProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
}

export function Sidebar({ workspaces, user, pages, databases }: SidebarProps) {
  const params = useParams()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const currentWorkspaceId = params?.workspaceId as string | undefined

  // Exclude database container pages and their direct children (row pages) from the Pages section
  const databasePageIds = new Set(databases.map(d => d.page_id))
  const regularPages = pages.filter(
    p => !databasePageIds.has(p.id) && !databasePageIds.has(p.parent_id ?? '')
  )

  function handleCreatePage(parentId: string | null) {
    if (!currentWorkspaceId) return
    startTransition(async () => {
      const page = await createPage(currentWorkspaceId, parentId)
      router.push(`/workspace/${currentWorkspaceId}/page/${page.id}`)
    })
  }

  function handleCreateDatabase() {
    if (!currentWorkspaceId) return
    startTransition(async () => {
      const { database } = await createDatabase(currentWorkspaceId)
      router.push(`/workspace/${currentWorkspaceId}/database/${database.id}`)
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
          <>
            <SidebarPageTree
              pages={regularPages.filter(p => p.workspace_id === currentWorkspaceId)}
              workspaceId={currentWorkspaceId}
              onCreatePage={handleCreatePage}
            />
            <SidebarDatabaseTree
              databases={databases}
              pages={pages}
              workspaceId={currentWorkspaceId}
              onCreateDatabase={handleCreateDatabase}
            />
          </>
        )}
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/SidebarDatabaseTree.tsx src/components/layout/Sidebar.tsx src/components/layout/AppShell.tsx src/app/(app)/layout.tsx
git commit -m "feat: add SidebarDatabaseTree and wire databases through layout/sidebar"
```

---

## Task 5: DatabaseShell and SchemaEditor

**Files:**
- Create: `src/components/database/DatabaseShell.tsx`
- Create: `src/components/database/SchemaEditor.tsx`

- [ ] **Step 1: Create `src/components/database/SchemaEditor.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { DatabaseField } from '@/lib/types/database'

interface SchemaEditorProps {
  schema: DatabaseField[]
  onChange: (schema: DatabaseField[]) => void
  onClose: () => void
}

const FIELD_TYPES: DatabaseField['type'][] = [
  'text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url',
]

export function SchemaEditor({ schema, onChange, onClose }: SchemaEditorProps) {
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<DatabaseField['type']>('text')

  function addField() {
    if (!newName.trim()) return
    const field: DatabaseField = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      type: newType,
      options: newType === 'select' || newType === 'multi_select' ? [] : undefined,
    }
    onChange([...schema, field])
    setNewName('')
    setNewType('text')
  }

  function removeField(id: string) {
    onChange(schema.filter(f => f.id !== id))
  }

  return (
    <div className="border-b bg-muted/20 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Fields</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <div className="space-y-2 mb-4">
        {schema.map(field => (
          <div key={field.id} className="flex items-center gap-2">
            <span className="text-sm flex-1">{field.name}</span>
            <span className="text-xs text-muted-foreground">{field.type}</span>
            <button
              onClick={() => removeField(field.id)}
              className="text-xs text-destructive hover:text-destructive/80"
              aria-label={`Remove ${field.name}`}
            >
              ×
            </button>
          </div>
        ))}
        {schema.length === 0 && (
          <p className="text-xs text-muted-foreground">No fields yet. Add one below.</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addField()}
          placeholder="Field name"
          className="text-sm border rounded-md px-2 py-1 flex-1 bg-background"
          aria-label="New field name"
        />
        <select
          value={newType}
          onChange={e => setNewType(e.target.value as DatabaseField['type'])}
          className="text-sm border rounded-md px-2 py-1 bg-background"
          aria-label="Field type"
        >
          {FIELD_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={addField}
          className="text-sm border rounded-md px-3 py-1 hover:bg-accent"
        >
          Add
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/database/DatabaseShell.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateDatabaseSchema, createRow, deleteRow } from '@/lib/actions/databases'
import { SchemaEditor } from './SchemaEditor'
import { TableView } from './TableView'

interface DatabaseShellProps {
  databaseId: string
  workspaceId: string
  title: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
}

export function DatabaseShell({ databaseId, workspaceId, title, schema, rows }: DatabaseShellProps) {
  const [currentSchema, setCurrentSchema] = useState(schema)
  const [currentRows, setCurrentRows] = useState(rows)
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleSchemaChange(newSchema: DatabaseField[]) {
    setCurrentSchema(newSchema)
    startTransition(async () => {
      try {
        await updateDatabaseSchema(databaseId, workspaceId, newSchema)
        setError(null)
      } catch {
        setError('Failed to update schema')
      }
    })
  }

  function handleAddRow() {
    startTransition(async () => {
      try {
        const row = await createRow(databaseId, workspaceId)
        setCurrentRows(prev => [...prev, row])
        setError(null)
      } catch {
        setError('Failed to create row')
      }
    })
  }

  function handleRowUpdate(rowId: string, fields: Record<string, unknown>) {
    setCurrentRows(prev => prev.map(r => r.id === rowId ? { ...r, fields } : r))
  }

  function handleDeleteRow(rowId: string) {
    setCurrentRows(prev => prev.filter(r => r.id !== rowId))
    startTransition(async () => {
      try {
        await deleteRow(rowId, databaseId, workspaceId)
        setError(null)
      } catch {
        setError('Failed to delete row')
      }
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <button
          onClick={() => setSchemaEditorOpen(v => !v)}
          className="text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-1"
        >
          Fields
        </button>
      </div>
      {error && <p className="text-sm text-destructive px-6 py-2">{error}</p>}
      {schemaEditorOpen && (
        <SchemaEditor
          schema={currentSchema}
          onChange={handleSchemaChange}
          onClose={() => setSchemaEditorOpen(false)}
        />
      )}
      <TableView
        databaseId={databaseId}
        workspaceId={workspaceId}
        schema={currentSchema}
        rows={currentRows}
        onAddRow={handleAddRow}
        onRowUpdate={handleRowUpdate}
        onDeleteRow={handleDeleteRow}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles (TableView doesn't exist yet — expect one TS error for missing module)**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: one error about `'./TableView'` not found. That's correct — we add it next.

- [ ] **Step 4: Commit**

```bash
git add src/components/database/DatabaseShell.tsx src/components/database/SchemaEditor.tsx
git commit -m "feat: add DatabaseShell and SchemaEditor components"
```

---

## Task 6: TableView

**Files:**
- Create: `src/components/database/TableView.tsx`

- [ ] **Step 1: Create `src/components/database/TableView.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateRowFields } from '@/lib/actions/databases'

interface CellProps {
  field: DatabaseField
  value: unknown
  onChange: (value: unknown) => void
}

function Cell({ field, value, onChange }: CellProps) {
  if (field.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={e => onChange(e.target.checked)}
        aria-label={field.name}
      />
    )
  }
  if (field.type === 'date') {
    return (
      <input
        type="date"
        defaultValue={String(value ?? '')}
        onBlur={e => onChange(e.target.value || null)}
        className="w-full bg-transparent text-sm outline-none"
        aria-label={field.name}
      />
    )
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        defaultValue={String(value ?? '')}
        onBlur={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-transparent text-sm outline-none"
        aria-label={field.name}
      />
    )
  }
  return (
    <input
      type="text"
      defaultValue={String(value ?? '')}
      onBlur={e => onChange(e.target.value)}
      className="w-full bg-transparent text-sm outline-none"
      aria-label={field.name}
    />
  )
}

interface TableViewProps {
  databaseId: string
  workspaceId: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
  onAddRow: () => void
  onRowUpdate: (rowId: string, fields: Record<string, unknown>) => void
  onDeleteRow: (rowId: string) => void
}

export function TableView({
  databaseId,
  workspaceId,
  schema,
  rows,
  onAddRow,
  onRowUpdate,
  onDeleteRow,
}: TableViewProps) {
  const [, startTransition] = useTransition()

  function handleCellChange(row: DatabaseRowWithTitle, field: DatabaseField, value: unknown) {
    const newFields = { ...row.fields, [field.id]: value }
    onRowUpdate(row.id, newFields)
    startTransition(async () => {
      await updateRowFields(row.id, databaseId, workspaceId, newFields)
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-48">Name</th>
            {schema.map(field => (
              <th key={field.id} className="text-left px-4 py-2 font-medium text-muted-foreground">
                {field.name}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-b hover:bg-accent/30 group">
              <td className="px-4 py-2">
                {row.page_id ? (
                  <Link
                    href={`/workspace/${workspaceId}/page/${row.page_id}`}
                    className="hover:underline font-medium"
                  >
                    {row.page_title || 'Untitled'}
                  </Link>
                ) : (
                  <span className="font-medium text-muted-foreground">{row.page_title || 'Untitled'}</span>
                )}
              </td>
              {schema.map(field => (
                <td key={field.id} className="px-4 py-2">
                  <Cell
                    field={field}
                    value={row.fields[field.id]}
                    onChange={value => handleCellChange(row, field, value)}
                  />
                </td>
              ))}
              <td className="px-2">
                <button
                  onClick={() => onDeleteRow(row.id)}
                  className="opacity-0 group-hover:opacity-100 text-destructive text-xs"
                  aria-label="Delete row"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={onAddRow}
        className="flex items-center gap-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 w-full border-b"
      >
        + New Row
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/database/TableView.tsx
git commit -m "feat: add TableView component with inline cell editing"
```

---

## Task 7: PropertiesPanel and Row Page Extension

**Files:**
- Create: `src/components/database/PropertiesPanel.tsx`
- Modify: `src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx`

- [ ] **Step 1: Create `src/components/database/PropertiesPanel.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { DatabaseField } from '@/lib/types/database'
import { updateRowFields } from '@/lib/actions/databases'

interface PropertiesPanelProps {
  rowId: string
  databaseId: string
  workspaceId: string
  schema: DatabaseField[]
  initialFields: Record<string, unknown>
}

export function PropertiesPanel({ rowId, databaseId, workspaceId, schema, initialFields }: PropertiesPanelProps) {
  const [fields, setFields] = useState(initialFields)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleChange(fieldId: string, value: unknown) {
    const newFields = { ...fields, [fieldId]: value }
    setFields(newFields)
    startTransition(async () => {
      try {
        await updateRowFields(rowId, databaseId, workspaceId, newFields)
        setError(null)
      } catch {
        setError('Failed to save')
      }
    })
  }

  return (
    <aside className="w-64 shrink-0 border-l bg-muted/20 px-4 py-6 overflow-y-auto">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Properties</h2>
      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      <div className="space-y-4">
        {schema.map(field => (
          <div key={field.id}>
            <label className="text-xs text-muted-foreground block mb-1">{field.name}</label>
            {field.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={Boolean(fields[field.id])}
                onChange={e => handleChange(field.id, e.target.checked)}
                aria-label={field.name}
              />
            ) : field.type === 'date' ? (
              <input
                type="date"
                defaultValue={String(fields[field.id] ?? '')}
                onBlur={e => handleChange(field.id, e.target.value || null)}
                className="w-full text-sm border rounded-md px-2 py-1 bg-background"
                aria-label={field.name}
              />
            ) : field.type === 'number' ? (
              <input
                type="number"
                defaultValue={String(fields[field.id] ?? '')}
                onBlur={e => handleChange(field.id, e.target.value === '' ? null : Number(e.target.value))}
                className="w-full text-sm border rounded-md px-2 py-1 bg-background"
                aria-label={field.name}
              />
            ) : (
              <input
                type="text"
                defaultValue={String(fields[field.id] ?? '')}
                onBlur={e => handleChange(field.id, e.target.value)}
                className="w-full text-sm border rounded-md px-2 py-1 bg-background"
                aria-label={field.name}
              />
            )}
          </div>
        ))}
        {schema.length === 0 && (
          <p className="text-xs text-muted-foreground">No properties yet. Add fields in the database.</p>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Update `src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx` to render PropertiesPanel for database row pages**

Replace the entire file with:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadBlocks } from '@/lib/actions/pages'
import { PageEditor } from '@/components/editor/PageEditor'
import { PropertiesPanel } from '@/components/database/PropertiesPanel'
import type { DatabaseField } from '@/lib/types/database'

export default async function PageViewPage({
  params,
}: {
  params: Promise<{ workspaceId: string; pageId: string }>
}) {
  const { workspaceId, pageId } = await params
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('pages')
    .select('id, title, workspace_id, workspace_members!inner(user_id)')
    .eq('id', pageId)
    .single()

  if (!page) notFound()

  const doc = await loadBlocks(pageId, workspaceId)

  // Check if this page is a database row
  const { data: dbRow } = await supabase
    .from('database_rows')
    .select('id, database_id, fields')
    .eq('page_id', pageId)
    .single()

  let dbSchema: DatabaseField[] | null = null
  if (dbRow) {
    const { data: db } = await supabase
      .from('databases')
      .select('schema')
      .eq('id', dbRow.database_id)
      .single()
    dbSchema = (db?.schema as DatabaseField[]) ?? null
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <PageEditor
          pageId={pageId}
          workspaceId={workspaceId}
          initialTitle={page.title}
          initialDoc={doc}
        />
      </div>
      {dbRow && dbSchema && (
        <PropertiesPanel
          rowId={dbRow.id}
          databaseId={dbRow.database_id}
          workspaceId={workspaceId}
          schema={dbSchema}
          initialFields={dbRow.fields as Record<string, unknown>}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/database/PropertiesPanel.tsx "src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx"
git commit -m "feat: add PropertiesPanel and render it on database row pages"
```

---

## Task 8: Database Route Page

**Files:**
- Create: `src/app/(app)/workspace/[workspaceId]/database/[databaseId]/page.tsx`

- [ ] **Step 1: Create the directory and page file**

```bash
mkdir -p "src/app/(app)/workspace/[workspaceId]/database/[databaseId]"
```

- [ ] **Step 2: Create `src/app/(app)/workspace/[workspaceId]/database/[databaseId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDatabase } from '@/lib/actions/databases'
import { DatabaseShell } from '@/components/database/DatabaseShell'

export default async function DatabasePage({
  params,
}: {
  params: Promise<{ workspaceId: string; databaseId: string }>
}) {
  const { workspaceId, databaseId } = await params
  const supabase = await createClient()

  // Verify workspace membership
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .single()
  if (!membership) notFound()

  let db
  try {
    db = await getDatabase(databaseId, workspaceId)
  } catch {
    notFound()
  }

  const { data: containerPage } = await supabase
    .from('pages')
    .select('title')
    .eq('id', db.page_id)
    .single()

  return (
    <DatabaseShell
      databaseId={databaseId}
      workspaceId={workspaceId}
      title={containerPage?.title ?? 'Untitled Database'}
      schema={db.schema}
      rows={db.rows}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Run all unit tests**

Run: `npx vitest run`
Expected: all tests PASS (including the 7 database action tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/workspace/[workspaceId]/database/[databaseId]/page.tsx"
git commit -m "feat: add database route page"
```

---

## Task 9: E2E Test

**Files:**
- Create: `e2e/databases.spec.ts`

- [ ] **Step 1: Create `e2e/databases.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('database flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('sidebar shows Databases section', async ({ page }) => {
    await expect(page.getByText('Databases')).toBeVisible()
  })

  test('clicking + New Database creates a database and navigates to it', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await expect(page.getByText('Fields')).toBeVisible()
  })

  test('adding a field and creating a row appears in the table', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    // Open schema editor
    await page.getByRole('button', { name: 'Fields' }).click()
    await page.getByLabel('New field name').fill('Status')
    await page.getByRole('button', { name: 'Add' }).click()
    // Close schema editor and add a row
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: '+ New Row' }).click()
    await expect(page.getByRole('link', { name: /untitled/i })).toBeVisible()
  })

  test('clicking a row link opens the row page with properties panel', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.getByRole('link', { name: /untitled/i }).click()
    await page.waitForURL(/\/page\//)
    await expect(page.getByPlaceholder('Untitled')).toBeVisible()
    await expect(page.getByText('Properties')).toBeVisible()
  })
})
```

- [ ] **Step 2: Verify E2E tests run (may fail if test environment not configured — that's OK)**

Run: `npx playwright test e2e/databases.spec.ts --reporter=list 2>&1 | head -30`
Expected: tests run (pass or fail based on your test environment setup). If E2E_EMAIL/E2E_PASSWORD env vars are not set, tests will fail at login — that is expected.

- [ ] **Step 3: Commit**

```bash
git add e2e/databases.spec.ts
git commit -m "test: add E2E tests for database creation and table view"
```
