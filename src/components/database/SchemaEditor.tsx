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
