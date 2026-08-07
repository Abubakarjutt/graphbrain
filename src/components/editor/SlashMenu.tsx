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
          if (items.length === 0) return false
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
        aria-activedescendant={`slash-option-${selectedIndex}`}
        onKeyDown={(e) => handleKeyDown(e)}
        style={{
          background: 'var(--background)',
          border: '1px solid color-mix(in oklch, var(--border) 80%, transparent)',
          borderRadius: 6,
          boxShadow: '0 4px 20px oklch(0 0 0 / 0.10), 0 1px 4px oklch(0 0 0 / 0.06)',
          minWidth: 240,
          maxHeight: 340,
          overflowY: 'auto',
          outline: 'none',
          padding: '4px 0',
        }}
      >
        {groups.map(({ label, items: groupItems }) => (
          <div key={label}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: 'var(--muted-foreground)',
                opacity: 0.7,
                padding: '8px 16px 3px',
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
                  id={`slash-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelect(item)}
                  style={{
                    padding: '5px 12px',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--accent)'
                      : 'transparent',
                    color: isSelected
                      ? 'var(--accent-foreground)'
                      : 'var(--foreground)',
                    borderRadius: 4,
                    margin: '1px 4px',
                    userSelect: 'none',
                    fontSize: 14,
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
