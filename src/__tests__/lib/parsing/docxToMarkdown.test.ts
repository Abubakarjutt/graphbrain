import { describe, it, expect, vi } from 'vitest'

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn(),
  },
}))

describe('docxToMarkdown', () => {
  it('converts mammoth HTML output into markdown', async () => {
    const mammoth = await import('mammoth')
    vi.mocked(mammoth.default.convertToHtml).mockResolvedValue({
      value: '<h1>Title</h1><p>Some <strong>bold</strong> text.</p><ul><li>One</li><li>Two</li></ul>',
      messages: [],
    })

    const { docxToMarkdown } = await import('@/lib/parsing/docxToMarkdown')
    const markdown = await docxToMarkdown(Buffer.from('fake-docx-bytes'))

    expect(markdown).toContain('Title\n=====')
    expect(markdown).toContain('**bold**')
    expect(markdown).toContain('*   One')
    expect(mammoth.default.convertToHtml).toHaveBeenCalledWith({ buffer: Buffer.from('fake-docx-bytes') })
  })

  it('propagates mammoth errors on corrupt input', async () => {
    const mammoth = await import('mammoth')
    vi.mocked(mammoth.default.convertToHtml).mockRejectedValue(new Error('corrupt docx'))

    const { docxToMarkdown } = await import('@/lib/parsing/docxToMarkdown')
    await expect(docxToMarkdown(Buffer.from('bad'))).rejects.toThrow('corrupt docx')
  })
})
