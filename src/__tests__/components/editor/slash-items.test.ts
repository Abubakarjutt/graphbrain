import { describe, it, expect } from 'vitest'
import { slashItems, filterSlashItems } from '@/components/editor/extensions/slash-items'

describe('slashItems registry', () => {
  const expectedTitles = [
    'Text',
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'To-do',
    'Bulleted list',
    'Numbered list',
    'Quote',
    'Divider',
    'Code',
    'Image',
    'Callout',
    'Toggle',
  ]

  it('contains all 13 expected block types', () => {
    const titles = slashItems.map((i) => i.title)
    for (const expected of expectedTitles) {
      expect(titles).toContain(expected)
    }
    expect(slashItems).toHaveLength(13)
  })

  it('each item has required shape', () => {
    for (const item of slashItems) {
      expect(typeof item.title).toBe('string')
      expect(Array.isArray(item.keywords)).toBe(true)
      expect(['Basic', 'Media']).toContain(item.group)
      expect(typeof item.command).toBe('function')
    }
  })

  describe('filterSlashItems', () => {
    it('returns all items for empty query', () => {
      expect(filterSlashItems('')).toHaveLength(slashItems.length)
    })

    it('returns exactly 3 headings for "head"', () => {
      const results = filterSlashItems('head')
      expect(results).toHaveLength(3)
      const titles = results.map((i) => i.title)
      expect(titles).toContain('Heading 1')
      expect(titles).toContain('Heading 2')
      expect(titles).toContain('Heading 3')
    })

    it('returns To-do for "todo"', () => {
      const results = filterSlashItems('todo')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('To-do')
    })

    it('matches title case-insensitively', () => {
      const results = filterSlashItems('TEXT')
      expect(results.some((i) => i.title === 'Text')).toBe(true)
    })

    it('matches keywords case-insensitively', () => {
      // "hr" matches Divider's keywords (hr, separator, rule, divider)
      const results = filterSlashItems('HR')
      expect(results.some((i) => i.title === 'Divider')).toBe(true)
    })

    it('returns empty array for non-matching query', () => {
      expect(filterSlashItems('xyzzy_nonexistent')).toHaveLength(0)
    })

    it('accepts a custom items array', () => {
      const subset = slashItems.slice(0, 3)
      expect(filterSlashItems('', subset)).toHaveLength(3)
    })
  })
})
