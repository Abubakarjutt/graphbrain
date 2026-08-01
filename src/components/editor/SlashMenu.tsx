'use client'

import {
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react'
import type { SlashItem } from '@/components/editor/extensions/slash-items'

export interface SlashMenuHandle {
  onKeyDown(event: KeyboardEvent): boolean
}

interface SlashMenuProps {
  items: SlashItem[]
  onSelect: (item: SlashItem) => void
  onClose: () => void
}

/** Groups items by their `group` field while preserving order. */
function groupItems(items: SlashItem[]): { label: string; items: SlashItem[] }[] {
  const map = new Map<string, SlashItem[]>()
  for (const item of items) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  function SlashMenu({ items, onSelect, onClose }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    const handleKeyDown = useCallback(
      (event: KeyboardEvent | React.KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          onSelect(items[selectedIndex])
          return true
        }
        if (event.key === 'Escape') {
          onClose()
          return true
        }
        return false
      },
      [items, selectedIndex, onSelect, onClose],
    )

    useImperativeHandle(ref, () => ({ onKeyDown: handleKeyDown as (e: KeyboardEvent) => boolean }), [handleKeyDown])

    const groups = groupItems(items)

    // Build flat index lookup for aria-selected
    const flatIndex = (item: SlashItem) => items.indexOf(item)

    return (
      <div
        role="listbox"
        tabIndex={0}
        onKeyDown={(e) => handleKeyDown(e)}
        style={{
          background: 'var(--background, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          minWidth: 220,
          maxHeight: 320,
          overflowY: 'auto',
          outline: 'none',
          padding: '4px 0',
        }}
      >
        {groups.map(({ label, items: groupItems }) => (
          <div key={label}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                color: 'var(--muted-foreground, #6b7280)',
                padding: '8px 12px 4px',
              }}
            >
              {label.toUpperCase()}
            </div>
            {groupItems.map((item) => {
              const idx = flatIndex(item)
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.title}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelect(item)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--gold, #f5c842)'
                      : 'transparent',
                    color: isSelected
                      ? 'var(--gold-foreground, #1a1a1a)'
                      : 'inherit',
                    borderRadius: 4,
                    margin: '1px 4px',
                    userSelect: 'none',
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  {item.title}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  },
)
