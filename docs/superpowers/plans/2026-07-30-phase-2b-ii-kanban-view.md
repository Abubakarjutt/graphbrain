# Phase 2b-ii: Kanban View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Kanban view to databases — rows grouped into columns by a `select` field, with drag-and-drop between columns to update the field value.

**Architecture:** `KanbanView` uses `@dnd-kit/core` (`useDraggable` on cards, `useDroppable` on columns). Dropping a card onto a column calls the existing `updateRowFields` server action. `DatabaseShell` gains a view-switcher tab bar (Table | Kanban | Calendar) above the active view. Phase 2b-i must be complete before starting this phase.

**Tech Stack:** Same as Phase 2b-i, plus `@dnd-kit/core` and `@dnd-kit/utilities`.

**Prerequisite:** Phase 2b-i complete and merged to `main`.

---

## File Map

| Action | Path |
|--------|------|
| Install | `@dnd-kit/core @dnd-kit/utilities` |
| Create | `src/components/database/KanbanView.tsx` |
| Modify | `src/components/database/DatabaseShell.tsx` |

---

## Task 1: Install @dnd-kit Dependencies

- [ ] **Step 1: Install packages**

```bash
npm install @dnd-kit/core @dnd-kit/utilities
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit/core and @dnd-kit/utilities for kanban drag-and-drop"
```

---

## Task 2: KanbanView Component

**Files:**
- Create: `src/components/database/KanbanView.tsx`

- [ ] **Step 1: Create `src/components/database/KanbanView.tsx`**

Kanban groups rows by a `select` field. Cards are draggable; columns are droppable. Dropping a card on a new column sets that column's option value on the row.

```tsx
'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateRowFields } from '@/lib/actions/databases'

// Sentinel used as the droppable ID for the "No Status" column
const NO_STATUS_ID = '__no_status__'

interface KanbanCardProps {
  row: DatabaseRowWithTitle
  workspaceId: string
}

function KanbanCard({ row, workspaceId }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="bg-background border rounded-md p-3 shadow-sm select-none"
    >
      <div
        {...listeners}
        className="w-6 h-1 bg-muted-foreground/30 rounded mb-2 cursor-grab active:cursor-grabbing"
        aria-label="Drag handle"
      />
      {row.page_id ? (
        <Link
          href={`/workspace/${workspaceId}/page/${row.page_id}`}
          className="text-sm font-medium hover:underline"
          onClick={e => e.stopPropagation()}
        >
          {row.page_title || 'Untitled'}
        </Link>
      ) : (
        <span className="text-sm font-medium">{row.page_title || 'Untitled'}</span>
      )}
    </div>
  )
}

interface KanbanColumnProps {
  id: string
  label: string
  rows: DatabaseRowWithTitle[]
  workspaceId: string
}

function KanbanColumn({ id, label, rows, workspaceId }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-lg p-3 transition-colors ${isOver ? 'bg-accent/60 ring-2 ring-primary' : 'bg-muted/30'}`}
    >
      <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">{label}</h3>
      <div className="space-y-2 min-h-[80px]">
        {rows.map(row => (
          <KanbanCard key={row.id} row={row} workspaceId={workspaceId} />
        ))}
      </div>
    </div>
  )
}

interface KanbanViewProps {
  databaseId: string
  workspaceId: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
  onRowUpdate: (rowId: string, fields: Record<string, unknown>) => void
}

export function KanbanView({ databaseId, workspaceId, schema, rows, onRowUpdate }: KanbanViewProps) {
  const [, startTransition] = useTransition()
  const selectField = schema.find(f => f.type === 'select')

  if (!selectField) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Add a Select field to use Kanban view.
      </div>
    )
  }

  const options = selectField.options ?? []
  const columns = [
    { id: NO_STATUS_ID, label: 'No Status' },
    ...options.map(o => ({ id: o, label: o })),
  ]

  function getColumnRows(columnId: string) {
    return rows.filter(r => {
      const val = r.fields[selectField!.id]
      if (columnId === NO_STATUS_ID) return val === null || val === undefined || val === ''
      return val === columnId
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const newOptionValue = over.id === NO_STATUS_ID ? null : String(over.id)
    const row = rows.find(r => r.id === String(active.id))
    if (!row) return

    const currentValue = row.fields[selectField!.id]
    const isAlreadyInColumn =
      over.id === NO_STATUS_ID
        ? currentValue === null || currentValue === undefined || currentValue === ''
        : currentValue === over.id
    if (isAlreadyInColumn) return

    const newFields = { ...row.fields, [selectField!.id]: newOptionValue }
    onRowUpdate(String(active.id), newFields)
    startTransition(async () => {
      await updateRowFields(String(active.id), databaseId, workspaceId, newFields)
    })
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-4 h-full overflow-x-auto">
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            rows={getColumnRows(col.id)}
            workspaceId={workspaceId}
          />
        ))}
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/database/KanbanView.tsx
git commit -m "feat: add KanbanView with drag-and-drop between columns"
```

---

## Task 3: Add View Switcher to DatabaseShell

**Files:**
- Modify: `src/components/database/DatabaseShell.tsx`

- [ ] **Step 1: Replace `src/components/database/DatabaseShell.tsx` with the view-switcher version**

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateDatabaseSchema, createRow, deleteRow } from '@/lib/actions/databases'
import { SchemaEditor } from './SchemaEditor'
import { TableView } from './TableView'
import { KanbanView } from './KanbanView'

type View = 'table' | 'kanban' | 'calendar'

interface DatabaseShellProps {
  databaseId: string
  workspaceId: string
  title: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
}

export function DatabaseShell({ databaseId, workspaceId, title, schema, rows }: DatabaseShellProps) {
  const [view, setView] = useState<View>('table')
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
      <div className="border-b px-6 py-3 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold shrink-0">{title}</h1>
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          {(['table', 'kanban', 'calendar'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                view === v
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSchemaEditorOpen(v => !v)}
          className="text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-1 shrink-0"
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
      {view === 'table' && (
        <TableView
          databaseId={databaseId}
          workspaceId={workspaceId}
          schema={currentSchema}
          rows={currentRows}
          onAddRow={handleAddRow}
          onRowUpdate={handleRowUpdate}
          onDeleteRow={handleDeleteRow}
        />
      )}
      {view === 'kanban' && (
        <KanbanView
          databaseId={databaseId}
          workspaceId={workspaceId}
          schema={currentSchema}
          rows={currentRows}
          onRowUpdate={handleRowUpdate}
        />
      )}
      {view === 'calendar' && (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Calendar view coming in Phase 2b-iii.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/database/DatabaseShell.tsx
git commit -m "feat: add Table/Kanban/Calendar view switcher to DatabaseShell"
```

---

## Task 4: E2E Test for Kanban

**Files:**
- Modify: `e2e/databases.spec.ts`

- [ ] **Step 1: Add Kanban tests to `e2e/databases.spec.ts`**

Append inside the existing `test.describe('database flow', ...)` block:

```ts
  test('switching to Kanban view shows the empty-state when no select field', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: 'Kanban' }).click()
    await expect(page.getByText('Add a Select field to use Kanban view')).toBeVisible()
  })

  test('Kanban view shows columns when a select field exists', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    // Add a select field with options
    await page.getByRole('button', { name: 'Fields' }).click()
    await page.getByLabel('New field name').fill('Priority')
    await page.getByLabel('Field type').selectOption('select')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    // Switch to Kanban
    await page.getByRole('button', { name: 'Kanban' }).click()
    await expect(page.getByText('No Status')).toBeVisible()
  })
```

- [ ] **Step 2: Commit**

```bash
git add e2e/databases.spec.ts
git commit -m "test: add Kanban view E2E tests"
```
