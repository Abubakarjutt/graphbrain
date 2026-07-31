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
