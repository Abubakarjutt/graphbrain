'use client'

import { useState, useTransition } from 'react'
import type { DatabaseField, DatabaseRowWithTitle, Page, TodoBoard } from '@/lib/types/database'
import { updateDatabaseSchema, createRow, deleteRow } from '@/lib/actions/databases'
import { SchemaEditor } from './SchemaEditor'
import { TableView } from './TableView'
import { KanbanView } from './KanbanView'
import { CalendarView } from './CalendarView'
import { TimeReportView } from './TimeReportView'

type View = 'table' | 'kanban' | 'calendar' | 'time'

const VIEW_ICONS: Record<View, React.ReactNode> = {
  table: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <rect x="1" y="1" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1 4.5h11M4.5 4.5v7.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  kanban: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <rect x="1" y="1" width="3" height="11" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="5" y="1" width="3" height="8" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
      <rect x="9" y="1" width="3" height="5" rx="0.75" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  calendar: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <rect x="1" y="2.5" width="11" height="9.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1 6h11M4 1v3M9 1v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  time: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.5 3.5v3l2.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

interface DatabaseShellProps {
  databaseId: string
  workspaceId: string
  title: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
  todoBoard: TodoBoard
  pages: Page[]
}

export function DatabaseShell({ databaseId, workspaceId, title, schema, rows, todoBoard, pages }: DatabaseShellProps) {
  const [view, setView] = useState<View>('table')
  const [currentSchema, setCurrentSchema] = useState(schema)
  const [currentRows, setCurrentRows] = useState(rows)
  // The Kanban/Calendar to-do board is an independent feature from the
  // table's schema/rows — it has its own lifted state, updated the same
  // optimistic way, but never reads or writes currentSchema/currentRows.
  const [currentTodoBoard, setCurrentTodoBoard] = useState(todoBoard)
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSchemaChange(newSchema: DatabaseField[]): Promise<boolean> {
    const previousSchema = currentSchema
    setCurrentSchema(newSchema)
    return new Promise<boolean>(resolve => {
      startTransition(async () => {
        try {
          await updateDatabaseSchema(databaseId, workspaceId, newSchema)
          setError(null)
          resolve(true)
        } catch {
          setCurrentSchema(previousSchema)
          setError('Failed to update schema')
          resolve(false)
        }
      })
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
    const insertIdx = currentRows.findIndex(r => r.id === rowId)
    const rowToDelete = currentRows[insertIdx]
    setCurrentRows(prev => prev.filter(r => r.id !== rowId))
    startTransition(async () => {
      try {
        await deleteRow(rowId, databaseId, workspaceId)
        setError(null)
      } catch {
        if (rowToDelete) {
          setCurrentRows(prev => {
            const next = [...prev]
            next.splice(Math.min(insertIdx, next.length), 0, rowToDelete)
            return next
          })
        }
        setError('Failed to delete row')
      }
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 h-11 flex items-center px-5 bg-background/95 backdrop-blur-sm border-b border-border/40 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <span className="text-muted-foreground/60 truncate font-medium">{title}</span>
        </div>
      </div>

      {/* Title area */}
      <div className="px-14 pt-12 pb-3">
        <div className="flex items-center gap-3 mb-1">
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent border border-border">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-accent-foreground">
              <rect x="3" y="3" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M3 8h16M8 8v11" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </span>
          <h1 className="font-display text-[2.5rem] font-light tracking-[-0.01em] leading-tight text-foreground">{title}</h1>
        </div>
      </div>

      {/* View tabs + actions */}
      <div className="border-b border-border/60 px-14 flex items-center justify-between">
        <div className="flex items-center -mb-px">
          {(['table', 'kanban', 'calendar', 'time'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] border-b-[1.5px] transition-colors ${
                view === v
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {VIEW_ICONS[v]}
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 pb-1">
          <button
            onClick={() => setSchemaEditorOpen(v => !v)}
            aria-expanded={schemaEditorOpen}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent border border-border/60 hover:border-border rounded px-2.5 py-1 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
              <rect x="1" y="1" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.1" />
              <path d="M1 4h9M4 1v9" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            Properties
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive px-14 py-2">{error}</p>}
      {schemaEditorOpen && (
        <div className={`px-14 py-3 border-b border-border/40 ${isPending ? 'pointer-events-none opacity-50' : ''}`}>
          <SchemaEditor
            schema={currentSchema}
            onChange={handleSchemaChange}
            onClose={() => setSchemaEditorOpen(false)}
          />
        </div>
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
          board={currentTodoBoard}
          pages={pages}
          onBoardChange={setCurrentTodoBoard}
        />
      )}
      {view === 'calendar' && (
        <CalendarView
          databaseId={databaseId}
          workspaceId={workspaceId}
          board={currentTodoBoard}
          onBoardChange={setCurrentTodoBoard}
        />
      )}
      {view === 'time' && (
        <TimeReportView
          databaseId={databaseId}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
