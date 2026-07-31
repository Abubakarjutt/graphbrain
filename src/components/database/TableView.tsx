'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateRowFields } from '@/lib/actions/databases'

interface CellProps {
  field: DatabaseField
  value: unknown
  onChange: (value: unknown) => void
}

function Cell({ field, value, onChange }: CellProps) {
  const [localValue, setLocalValue] = useState(String(value ?? ''))

  useEffect(() => {
    setLocalValue(String(value ?? ''))
  }, [value])

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
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
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
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-transparent text-sm outline-none"
        aria-label={field.name}
      />
    )
  }
  // url and select: text input is adequate; multi_select stores as string (array coercion not yet implemented)
  return (
    <input
      type="text"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
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
      try {
        await updateRowFields(row.id, databaseId, workspaceId, newFields)
      } catch {
        onRowUpdate(row.id, row.fields)
      }
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/30">
            <th scope="col" className="text-left px-4 py-2 font-medium text-muted-foreground w-48">Name</th>
            {schema.map(field => (
              <th key={field.id} scope="col" className="text-left px-4 py-2 font-medium text-muted-foreground">
                {field.name}
              </th>
            ))}
            <th scope="col" className="w-8" />
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
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-destructive text-xs"
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
