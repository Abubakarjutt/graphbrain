'use client'

import { useState, useEffect, useTransition } from 'react'
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
  // localValues drives controlled text/date/number inputs so they visually revert on server failure
  const [localValues, setLocalValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of schema) init[f.id] = String(initialFields[f.id] ?? '')
    return init
  })
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setLocalValues(prev => {
      const additions: Record<string, string> = {}
      for (const f of schema) {
        if (!(f.id in prev)) additions[f.id] = ''
      }
      return Object.keys(additions).length > 0 ? { ...prev, ...additions } : prev
    })
  }, [schema])

  function handleChange(fieldId: string, value: unknown, displayValue?: string) {
    const previous = fields
    const previousLocal = localValues
    const newFields = { ...fields, [fieldId]: value }
    setFields(newFields)
    if (displayValue !== undefined) setLocalValues(prev => ({ ...prev, [fieldId]: displayValue }))
    startTransition(async () => {
      try {
        await updateRowFields(rowId, databaseId, workspaceId, newFields)
        setError(null)
      } catch {
        setFields(previous)
        setLocalValues(previousLocal)
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
                value={localValues[field.id] ?? ''}
                onChange={e => setLocalValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                onBlur={e => handleChange(field.id, e.target.value || null, e.target.value)}
                className="w-full text-sm border rounded-md px-2 py-1 bg-background"
                aria-label={field.name}
              />
            ) : field.type === 'number' ? (
              <input
                type="number"
                value={localValues[field.id] ?? ''}
                onChange={e => setLocalValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                onBlur={e => handleChange(field.id, e.target.value === '' ? null : Number(e.target.value), e.target.value)}
                className="w-full text-sm border rounded-md px-2 py-1 bg-background"
                aria-label={field.name}
              />
            ) : (
              <input
                type="text"
                value={localValues[field.id] ?? ''}
                onChange={e => setLocalValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                onBlur={e => handleChange(field.id, e.target.value, e.target.value)}
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
