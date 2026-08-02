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
  const [isPending, startTransition] = useTransition()

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
    const newFields = { ...fields, [fieldId]: value }
    setFields(newFields)
    if (displayValue !== undefined) setLocalValues(prev => ({ ...prev, [fieldId]: displayValue }))
    startTransition(async () => {
      try {
        await updateRowFields(rowId, databaseId, workspaceId, newFields)
        setError(null)
      } catch {
        // Revert only the edited field's displayed value, derived from the
        // pre-edit `fields` snapshot — `localValues` itself was already
        // overwritten by onChange before this ran, so it can't be used as
        // the "previous" snapshot to restore.
        setFields(previous)
        setLocalValues(prev => ({ ...prev, [fieldId]: String(previous[fieldId] ?? '') }))
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
            ) : field.type === 'select' ? (() => {
              const value = fields[field.id]
              const knownOptions = field.options ?? []
              const isOrphaned = typeof value === 'string' && value !== '' && !knownOptions.includes(value)
              return (
                <select
                  value={typeof value === 'string' ? value : ''}
                  onChange={e => handleChange(field.id, e.target.value || null)}
                  disabled={isPending}
                  className="w-full text-sm border rounded-md px-2 py-1 bg-background disabled:opacity-50"
                  aria-label={field.name}
                >
                  <option value="">—</option>
                  {isOrphaned && <option value={value as string}>{value as string} (removed)</option>}
                  {knownOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )
            })() : field.type === 'multi_select' ? (() => {
              const selected = Array.isArray(fields[field.id]) ? fields[field.id] as string[] : []
              const knownOptions = field.options ?? []
              const orphanedSelected = selected.filter(opt => !knownOptions.includes(opt))
              return (
                <div role="group" aria-label={field.name} className="flex flex-wrap gap-1">
                  {[...knownOptions, ...orphanedSelected].map(opt => {
                    const isSelected = selected.includes(opt)
                    const isOrphan = orphanedSelected.includes(opt)
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleChange(field.id, isSelected ? selected.filter(o => o !== opt) : [...selected, opt])}
                        aria-pressed={isSelected}
                        disabled={isPending}
                        title={isOrphan ? 'This option was removed from the field' : undefined}
                        className={`text-xs rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
                          isSelected ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                        } ${isOrphan ? 'italic' : ''}`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                  {knownOptions.length === 0 && orphanedSelected.length === 0 && (
                    <span className="text-xs text-muted-foreground/50">No options yet</span>
                  )}
                </div>
              )
            })() : field.type === 'date' ? (
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
