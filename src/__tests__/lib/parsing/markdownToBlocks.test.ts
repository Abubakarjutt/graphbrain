import { describe, it, expect } from 'vitest'
import { markdownToBlocks } from '@/lib/parsing/markdownToBlocks'

describe('markdownToBlocks', () => {
  it('converts a heading to a heading node', () => {
    const doc = markdownToBlocks('# Title')
    expect(doc.type).toBe('doc')
    expect(doc.content[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
  })

  it('converts a paragraph with bold text', () => {
    const doc = markdownToBlocks('Some **bold** text.')
    const paragraph = doc.content[0]
    expect(paragraph.type).toBe('paragraph')
    const boldNode = paragraph.content?.find(n => n.marks?.some(m => m.type === 'bold'))
    expect(boldNode?.text).toBe('bold')
  })

  it('converts a bullet list', () => {
    const doc = markdownToBlocks('- One\n- Two')
    expect(doc.content[0].type).toBe('bulletList')
    expect(doc.content[0].content).toHaveLength(2)
    expect(doc.content[0].content?.[0].type).toBe('listItem')
  })

  it('converts a link', () => {
    const doc = markdownToBlocks('[click here](https://example.com)')
    const paragraph = doc.content[0]
    const linkNode = paragraph.content?.find(n => n.marks?.some(m => m.type === 'link'))
    expect(linkNode?.marks?.[0].attrs?.href).toBe('https://example.com')
  })
})
