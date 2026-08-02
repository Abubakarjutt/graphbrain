'use client'

import { useState } from 'react'
import type { DatabaseField } from '@/lib/types/database'

interface SchemaEditorProps {
  schema: DatabaseField[]
  // Returning false signals a failed persist — SchemaEditor keeps the
  // user's draft input intact so they don't lose typed text and can retry.
  onChange: (schema: DatabaseField[]) => Promise<boolean> | void
  onClose: () => void
}

const FIELD_TYPES: DatabaseField['type'][] = [
  'text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url',
]

const OPTION_TYPES: DatabaseField['type'][] = ['select', 'multi_select']

function isDuplicateOption(options: string[], candidate: string): boolean {
  return options.some(o => o.toLowerCase() === candidate.toLowerCase())
}

export function SchemaEditor({ schema, onChange, onClose }: SchemaEditorProps) {
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<DatabaseField['type']>('text')
  const [newOptions, setNewOptions] = useState<string[]>([])
  const [newOptionDraft, setNewOptionDraft] = useState('')
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})

  async function addField() {
    if (!newName.trim()) return
    // Flush whatever's still sitting in the option box, uncommitted — a user
    // who types an option and then hits Enter in the name field (or clicks
    // Add) without first pressing Enter there shouldn't lose it.
    const pending = newOptionDraft.trim()
    const finalOptions = pending && !isDuplicateOption(newOptions, pending)
      ? [...newOptions, pending]
      : newOptions

    const field: DatabaseField = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      type: newType,
      options: OPTION_TYPES.includes(newType) ? finalOptions : undefined,
    }
    const result = await onChange([...schema, field])
    if (result === false) return
    setNewName('')
    setNewType('text')
    setNewOptions([])
    setNewOptionDraft('')
  }

  function removeField(id: string) {
    onChange(schema.filter(f => f.id !== id))
  }

  function addNewFieldOption() {
    const opt = newOptionDraft.trim()
    if (!opt || isDuplicateOption(newOptions, opt)) return
    setNewOptions(prev => [...prev, opt])
    setNewOptionDraft('')
  }

  function removeNewFieldOption(opt: string) {
    setNewOptions(prev => prev.filter(o => o !== opt))
  }

  async function addExistingOption(fieldId: string) {
    const draft = (optionDrafts[fieldId] ?? '').trim()
    if (!draft) return
    const field = schema.find(f => f.id === fieldId)
    if (!field || isDuplicateOption(field.options ?? [], draft)) return
    const result = await onChange(schema.map(f => f.id === fieldId ? { ...f, options: [...(f.options ?? []), draft] } : f))
    if (result === false) return
    setOptionDrafts(prev => ({ ...prev, [fieldId]: '' }))
  }

  function removeExistingOption(fieldId: string, opt: string) {
    onChange(schema.map(f => f.id === fieldId ? { ...f, options: (f.options ?? []).filter(o => o !== opt) } : f))
  }

  return (
    <div className="border-b bg-muted/20 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Fields</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <div className="space-y-3 mb-4">
        {schema.map(field => (
          <div key={field.id}>
            <div className="flex items-center gap-2">
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
            {OPTION_TYPES.includes(field.type) && (
              <div className="mt-1.5 pl-1 flex flex-wrap items-center gap-1.5">
                {(field.options ?? []).map(opt => (
                  <span key={opt} className="inline-flex items-center gap-1 text-xs bg-accent text-accent-foreground rounded px-1.5 py-0.5">
                    {opt}
                    <button
                      onClick={() => removeExistingOption(field.id, opt)}
                      aria-label={`Remove option ${opt} from ${field.name}`}
                      className="text-accent-foreground/60 hover:text-accent-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={optionDrafts[field.id] ?? ''}
                  onChange={e => setOptionDrafts(prev => ({ ...prev, [field.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExistingOption(field.id) } }}
                  placeholder="Add option"
                  aria-label={`New option for ${field.name}`}
                  className="text-xs border rounded px-1.5 py-0.5 w-24 bg-background"
                />
              </div>
            )}
          </div>
        ))}
        {schema.length === 0 && (
          <p className="text-xs text-muted-foreground">No fields yet. Add one below.</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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
      {OPTION_TYPES.includes(newType) && (
        <div className="mt-2 pl-1 flex flex-wrap items-center gap-1.5">
          {newOptions.map(opt => (
            <span key={opt} className="inline-flex items-center gap-1 text-xs bg-accent text-accent-foreground rounded px-1.5 py-0.5">
              {opt}
              <button
                onClick={() => removeNewFieldOption(opt)}
                aria-label={`Remove option ${opt}`}
                className="text-accent-foreground/60 hover:text-accent-foreground"
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={newOptionDraft}
            onChange={e => setNewOptionDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewFieldOption() } }}
            placeholder="Add option, press Enter"
            aria-label="New field option"
            className="text-xs border rounded px-1.5 py-0.5 w-32 bg-background"
          />
        </div>
      )}
    </div>
  )
}
