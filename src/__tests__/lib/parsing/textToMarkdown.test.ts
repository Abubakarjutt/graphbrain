import { describe, it, expect } from 'vitest'
import { textToMarkdown } from '@/lib/parsing/textToMarkdown'

describe('textToMarkdown', () => {
  it('joins single-newline lines within a paragraph', () => {
    const buffer = Buffer.from('line one\nline two')
    expect(textToMarkdown(buffer)).toBe('line one\nline two')
  })

  it('splits paragraphs on blank lines', () => {
    const buffer = Buffer.from('First paragraph.\n\nSecond paragraph.')
    expect(textToMarkdown(buffer)).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('trims whitespace around each paragraph and collapses multiple blank lines', () => {
    const buffer = Buffer.from('  First.  \n\n\n\n   Second.   ')
    expect(textToMarkdown(buffer)).toBe('First.\n\nSecond.')
  })

  it('drops empty paragraphs produced by leading/trailing blank lines', () => {
    const buffer = Buffer.from('\n\nOnly paragraph.\n\n')
    expect(textToMarkdown(buffer)).toBe('Only paragraph.')
  })
})
