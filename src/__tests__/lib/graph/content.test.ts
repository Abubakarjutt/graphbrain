import { describe, it, expect } from 'vitest'
import { pageToText, fileToText, rowToText, parseMentions } from '@/lib/graph/content'
import type { Block, TiptapNode } from '@/lib/types/database'

function makeBlock(node: TiptapNode): Block {
  return { id: 'b1', page_id: 'p1', type: 'text', content: node as unknown as Record<string, unknown>, position: 0, created_at: '' }
}

describe('pageToText', () => {
  it('returns just the title when blocks is empty', () => {
    expect(pageToText('My Page', [])).toBe('My Page')
  })

  it('concatenates title with text from a single block', () => {
    const block = makeBlock({ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] })
    expect(pageToText('Title', [block])).toBe('Title\nHello world')
  })

  it('extracts text from multiple blocks', () => {
    const b1 = makeBlock({ type: 'paragraph', content: [{ type: 'text', text: 'First' }] })
    const b2 = makeBlock({ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] })
    expect(pageToText('T', [b1, b2])).toBe('T\nFirst\nSecond')
  })

  it('extracts text from nested inline nodes', () => {
    const block = makeBlock({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' normal' },
      ],
    })
    expect(pageToText('T', [block])).toBe('T\nBold\n normal')
  })

  it('skips blocks with no text nodes', () => {
    const block = makeBlock({ type: 'image', attrs: { src: 'img.png' } })
    expect(pageToText('Title', [block])).toBe('Title')
  })
})

describe('fileToText', () => {
  it('returns null for null input', () => {
    expect(fileToText(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(fileToText('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(fileToText('   ')).toBeNull()
  })

  it('returns the text unchanged for non-empty input', () => {
    expect(fileToText('extracted content')).toBe('extracted content')
  })
})

describe('rowToText', () => {
  it('returns empty string for empty fields', () => {
    expect(rowToText({})).toBe('')
  })

  it('formats fields as key: value pairs sorted alphabetically by key', () => {
    expect(rowToText({ name: 'Alice', age: 30 })).toBe('age: 30\nname: Alice')
  })

  it('coerces null field values to empty string', () => {
    expect(rowToText({ status: null })).toBe('status: ')
  })

  it('coerces boolean field values', () => {
    expect(rowToText({ done: true })).toBe('done: true')
  })
})

describe('parseMentions', () => {
  it('returns empty array when no [[mentions]] present', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'No mentions here' }] }]
    expect(parseMentions(nodes)).toEqual([])
  })

  it('extracts a single mention', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'See [[Project X]]' }] }]
    expect(parseMentions(nodes)).toEqual(['Project X'])
  })

  it('extracts multiple distinct mentions', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: '[[Page A]] and [[Page B]]' }] }]
    const result = parseMentions(nodes)
    expect(result).toContain('Page A')
    expect(result).toContain('Page B')
    expect(result).toHaveLength(2)
  })

  it('deduplicates repeated mentions', () => {
    const nodes: TiptapNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: '[[Page A]] and [[Page A]]' }] }]
    expect(parseMentions(nodes)).toEqual(['Page A'])
  })

  it('returns empty array for nodes with no text content', () => {
    const nodes: TiptapNode[] = [{ type: 'image', attrs: { src: 'img.png' } }]
    expect(parseMentions(nodes)).toEqual([])
  })
})
