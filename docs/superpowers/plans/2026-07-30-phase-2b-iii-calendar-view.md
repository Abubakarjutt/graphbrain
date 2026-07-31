# Phase 2b-iii: Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Calendar view to databases — rows with a `date` field appear as events on a monthly calendar; clicking a date slot creates a new row pre-filled with that date.

**Architecture:** `CalendarView` uses `react-big-calendar` with the `date-fns` localizer. Rows are mapped to calendar events by their chosen `date` field. Clicking a slot calls the existing `createRow` server action with `initialFields` pre-set. `DatabaseShell` is updated to render `CalendarView` instead of the placeholder. Phase 2b-ii must be complete before starting this phase.

**Tech Stack:** Same as Phase 2b-ii, plus `react-big-calendar`, `date-fns`, `@types/react-big-calendar`.

**Prerequisite:** Phase 2b-ii complete and merged to `main`.

---

## File Map

| Action | Path |
|--------|------|
| Install | `react-big-calendar date-fns @types/react-big-calendar` |
| Create | `src/components/database/CalendarView.tsx` |
| Modify | `src/components/database/DatabaseShell.tsx` |

---

## Task 1: Install Dependencies

- [ ] **Step 1: Install packages**

```bash
npm install react-big-calendar date-fns
npm install --save-dev @types/react-big-calendar
```

- [ ] **Step 2: Verify TypeScript recognises the types**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install react-big-calendar and date-fns for calendar view"
```

---

## Task 2: CalendarView Component

**Files:**
- Create: `src/components/database/CalendarView.tsx`

- [ ] **Step 1: Create `src/components/database/CalendarView.tsx`**

`react-big-calendar` requires a CSS import. In a Next.js App Router client component, this import works at the top of the file. The component renders a monthly calendar; clicking an empty slot calls `createRow` with the date pre-filled.

```tsx
'use client'

import 'react-big-calendar/lib/css/react-big-calendar.css'

import { useTransition } from 'react'
import { Calendar, dateFnsLocalizer, SlotInfo } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { createRow } from '@/lib/actions/databases'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
})

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: DatabaseRowWithTitle
}

interface CalendarViewProps {
  databaseId: string
  workspaceId: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
  onRowCreated: (row: DatabaseRowWithTitle) => void
}

export function CalendarView({ databaseId, workspaceId, schema, rows, onRowCreated }: CalendarViewProps) {
  const [, startTransition] = useTransition()
  const dateField = schema.find(f => f.type === 'date')

  if (!dateField) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Add a Date field to use Calendar view.
      </div>
    )
  }

  const events: CalendarEvent[] = rows
    .filter(r => r.fields[dateField.id] != null && r.fields[dateField.id] !== '')
    .map(r => {
      const dateStr = String(r.fields[dateField.id])
      // Date strings from date inputs are YYYY-MM-DD — parse as local midnight
      const date = new Date(dateStr + 'T00:00:00')
      return {
        id: r.id,
        title: r.page_title || 'Untitled',
        start: date,
        end: date,
        resource: r,
      }
    })

  function handleSelectSlot(slot: SlotInfo) {
    const dateStr = format(slot.start, 'yyyy-MM-dd')
    startTransition(async () => {
      const row = await createRow(databaseId, workspaceId, { [dateField!.id]: dateStr })
      onRowCreated(row)
    })
  }

  return (
    <div className="flex-1 p-4" style={{ minHeight: '500px' }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        selectable
        onSelectSlot={handleSelectSlot}
        style={{ height: '100%' }}
        views={['month']}
        defaultView="month"
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/database/CalendarView.tsx
git commit -m "feat: add CalendarView component with react-big-calendar"
```

---

## Task 3: Wire CalendarView into DatabaseShell

**Files:**
- Modify: `src/components/database/DatabaseShell.tsx`

- [ ] **Step 1: Replace `src/components/database/DatabaseShell.tsx` with the Calendar-enabled version**

The only changes from Phase 2b-ii are:
- Import `CalendarView`
- Replace the "coming soon" placeholder with `<CalendarView ...>`
- Add `onRowCreated` handler that appends the new row to `currentRows`

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateDatabaseSchema, createRow, deleteRow } from '@/lib/actions/databases'
import { SchemaEditor } from './SchemaEditor'
import { TableView } from './TableView'
import { KanbanView } from './KanbanView'
import { CalendarView } from './CalendarView'

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

  function handleRowCreated(row: DatabaseRowWithTitle) {
    setCurrentRows(prev => [...prev, row])
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
        <CalendarView
          databaseId={databaseId}
          workspaceId={workspaceId}
          schema={currentSchema}
          rows={currentRows}
          onRowCreated={handleRowCreated}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run all unit tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/database/DatabaseShell.tsx
git commit -m "feat: wire CalendarView into DatabaseShell replacing the placeholder"
```

---

## Task 4: E2E Test for Calendar

**Files:**
- Modify: `e2e/databases.spec.ts`

- [ ] **Step 1: Append Calendar E2E tests to `e2e/databases.spec.ts`**

Append inside the existing `test.describe('database flow', ...)` block:

```ts
  test('Calendar view shows empty-state when no date field exists', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: 'Calendar' }).click()
    await expect(page.getByText('Add a Date field to use Calendar view')).toBeVisible()
  })

  test('Calendar view renders a month grid when a date field exists', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    // Add a date field
    await page.getByRole('button', { name: 'Fields' }).click()
    await page.getByLabel('New field name').fill('Due Date')
    await page.getByLabel('Field type').selectOption('date')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    // Switch to Calendar
    await page.getByRole('button', { name: 'Calendar' }).click()
    // The react-big-calendar month grid renders day cells
    await expect(page.locator('.rbc-month-view')).toBeVisible()
  })
```

- [ ] **Step 2: Commit**

```bash
git add e2e/databases.spec.ts
git commit -m "test: add Calendar view E2E tests"
```
