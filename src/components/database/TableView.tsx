'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateRowFields } from '@/lib/actions/databases'

const FIELD_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <path d="M1.5 2.5h8M5.5 2.5v6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  number: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <path d="M2 8.5L4.5 2.5M6.5 8.5L9 2.5M1.5 5h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  checkbox: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3.5 5.5l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  date: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="1" y="2" width="9" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1 5h9M3.5 1v2M7.5 1v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  select: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <circle cx="5.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  multi_select: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <circle cx="3.5" cy="5.5" r="1.6" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="7.5" cy="5.5" r="1.6" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
}

interface CellProps {
  field: DatabaseField
  value: unknown
  onChange: (value: unknown) => void
  disabled: boolean
}

function Cell({ field, value, onChange, disabled }: CellProps) {
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
        className="h-3.5 w-3.5 rounded-[3px] border-border/70 accent-foreground cursor-pointer"
        aria-label={field.name}
      />
    )
  }
  if (field.type === 'select') {
    const knownOptions = field.options ?? []
    // A row can hold a value whose option was since removed from the field.
    // Surface it as a distinct, visible entry rather than rendering a select
    // with a value that matches no <option> — which browsers show as blank,
    // silently hiding that the row still has (unsaved-looking) data.
    const isOrphaned = typeof value === 'string' && value !== '' && !knownOptions.includes(value)
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full bg-transparent text-sm outline-none text-foreground disabled:opacity-50"
        aria-label={field.name}
      >
        <option value="">—</option>
        {isOrphaned && <option value={value as string}>{value as string} (removed)</option>}
        {knownOptions.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }
  if (field.type === 'multi_select') {
    const selected = Array.isArray(value) ? value as string[] : []
    const knownOptions = field.options ?? []
    const orphanedSelected = selected.filter(opt => !knownOptions.includes(opt))
    function toggle(opt: string) {
      onChange(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt])
    }
    return (
      <div role="group" aria-label={field.name} className="flex flex-wrap gap-1">
        {[...knownOptions, ...orphanedSelected].map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            aria-pressed={selected.includes(opt)}
            disabled={disabled}
            title={orphanedSelected.includes(opt) ? 'This option was removed from the field' : undefined}
            className={`text-xs rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
              selected.includes(opt)
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            } ${orphanedSelected.includes(opt) ? 'italic' : ''}`}
          >
            {opt}
          </button>
        ))}
        {knownOptions.length === 0 && orphanedSelected.length === 0 && (
          <span className="text-xs text-muted-foreground/50">No options yet</span>
        )}
      </div>
    )
  }
  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={e => onChange(e.target.value || null)}
        className="w-full bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground/50"
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
        className="w-full bg-transparent text-sm outline-none text-foreground"
        aria-label={field.name}
      />
    )
  }
  return (
    <input
      type="text"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      className="w-full bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground/40"
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
  // Keyed by `${rowId}:${fieldId}` so a write to one cell only disables that
  // cell — a single shared isPending flag disabled every select/multi_select
  // in the whole table for the duration of any one write, and since blur
  // fires before the disabled state commits, it silently swallowed the next
  // click on an unrelated cell instead of just being overly cautious.
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())

  function handleCellChange(row: DatabaseRowWithTitle, field: DatabaseField, value: unknown) {
    const newFields = { ...row.fields, [field.id]: value }
    onRowUpdate(row.id, newFields)
    const cellKey = `${row.id}:${field.id}`
    setPendingCells(prev => new Set(prev).add(cellKey))
    startTransition(async () => {
      try {
        await updateRowFields(row.id, databaseId, workspaceId, newFields)
      } catch {
        onRowUpdate(row.id, row.fields)
      } finally {
        setPendingCells(prev => {
          const next = new Set(prev)
          next.delete(cellKey)
          return next
        })
      }
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm min-w-max" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'oklch(0 0 0 / 2.5%)', borderBottom: '1px solid var(--border)' }}>
            <th
              scope="col"
              className="sticky left-0 text-left w-56"
              style={{
                padding: '7px 16px',
                background: 'oklch(0 0 0 / 3%)',
                borderRight: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] uppercase" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden>
                  <path d="M3 2h3.5L9 4.5V9H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  <path d="M6.5 2v2.5H9" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
                Name
              </div>
            </th>
            {schema.map(field => (
              <th
                key={field.id}
                scope="col"
                className="text-left min-w-[160px]"
                style={{
                  padding: '7px 16px',
                  borderRight: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] uppercase" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                  <span style={{ opacity: 0.7 }}>{FIELD_TYPE_ICONS[field.type] ?? FIELD_TYPE_ICONS.text}</span>
                  {field.name}
                </div>
              </th>
            ))}
            <th scope="col" className="w-10 px-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              className="group transition-colors"
              style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'oklch(0 0 0 / 1%)' : 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? 'oklch(0 0 0 / 1%)' : 'transparent' }}
            >
              <td
                className="sticky left-0"
                style={{
                  padding: '8px 16px',
                  borderRight: '1px solid var(--border)',
                  background: 'inherit',
                }}
              >
                {row.page_id ? (
                  <Link
                    href={`/workspace/${workspaceId}/page/${row.page_id}`}
                    className="flex items-center gap-1.5 font-medium text-foreground hover:underline"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.35, flexShrink: 0 }} aria-hidden>
                      <path d="M2.5 1.5h5l2 2v7h-7V1.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                      <path d="M7.5 1.5v2h2" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                    </svg>
                    {row.page_title || 'Untitled'}
                  </Link>
                ) : (
                  <span className="font-medium" style={{ color: 'var(--muted-foreground)' }}>{row.page_title || 'Untitled'}</span>
                )}
              </td>
              {schema.map(field => (
                <td key={field.id} style={{ padding: '8px 16px', borderRight: '1px solid var(--border)' }}>
                  <Cell
                    field={field}
                    value={row.fields[field.id]}
                    onChange={value => handleCellChange(row, field, value)}
                    disabled={pendingCells.has(`${row.id}:${field.id}`)}
                  />
                </td>
              ))}
              <td style={{ padding: '8px 8px', width: '40px', textAlign: 'center' }}>
                <button
                  onClick={() => onDeleteRow(row.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ color: 'var(--muted-foreground)' }}
                  aria-label="Delete row"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--destructive)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)' }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={onAddRow}
        className="flex items-center gap-2 w-full text-left transition-colors cursor-pointer"
        style={{
          padding: '8px 16px',
          fontSize: '12px',
          color: 'var(--muted-foreground)',
          opacity: 0.5,
          borderBottom: '1px solid var(--border)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.opacity = '1'
          ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.opacity = '0.5'
          ;(e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
          <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        New row
      </button>
    </div>
  )
}
