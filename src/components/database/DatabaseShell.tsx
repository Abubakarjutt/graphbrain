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
    const previousSchema = currentSchema
    setCurrentSchema(newSchema)
    startTransition(async () => {
      try {
        await updateDatabaseSchema(databaseId, workspaceId, newSchema)
        setError(null)
      } catch {
        setCurrentSchema(previousSchema)
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
    const rowToDelete = currentRows.find(r => r.id === rowId)
    setCurrentRows(prev => prev.filter(r => r.id !== rowId))
    startTransition(async () => {
      try {
        await deleteRow(rowId, databaseId, workspaceId)
        setError(null)
      } catch {
        if (rowToDelete) setCurrentRows(prev => [...prev, rowToDelete])
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
          aria-expanded={schemaEditorOpen}
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
