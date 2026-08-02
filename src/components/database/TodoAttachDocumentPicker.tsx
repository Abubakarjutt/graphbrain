'use client'

import { useState } from 'react'
import type { Page } from '@/lib/types/database'

interface TodoAttachDocumentPickerProps {
  pages: Page[]
  onSelect: (page: Page) => void
  onClose: () => void
}

export function TodoAttachDocumentPicker({ pages, onSelect, onClose }: TodoAttachDocumentPickerProps) {
  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim().toLowerCase()
  const filtered = trimmedQuery
    ? pages.filter(p => p.title.toLowerCase().includes(trimmedQuery))
    : pages

  return (
    <div
      role="dialog"
      aria-label="Attach document"
      className="absolute z-20 mt-1 w-56 rounded-md border bg-popover shadow-md p-2"
    >
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search pages..."
        aria-label="Search pages"
        className="w-full text-xs border rounded px-2 py-1 mb-1 bg-background"
      />
      <ul className="max-h-48 overflow-y-auto">
        {filtered.map(p => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent truncate"
            >
              {p.title || 'Untitled'}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-xs text-muted-foreground px-2 py-1">No matching pages</li>
        )}
      </ul>
      <button
        type="button"
        onClick={onClose}
        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  )
}
