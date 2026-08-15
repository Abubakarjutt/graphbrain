import { describe, it, expect, vi } from 'vitest'

const mockStreamChat = vi.fn()
vi.mock('@/lib/graph/ollama', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}))
vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(function() {
    return {
      getText: vi.fn().mockResolvedValue({ text: 'Paragraph one.\n\nParagraph two.' }),
    }
  }),
}))

async function* fakeStream(tokens: string[]) {
  for (const t of tokens) yield t
}

describe('splitIntoChunks', () => {
  it('keeps paragraphs under targetSize together in one chunk', async () => {
    const { splitIntoChunks } = await import('@/lib/parsing/pdfToMarkdown')
    const chunks = splitIntoChunks('Short one.\n\nShort two.', { targetSize: 100, hardMax: 200 })
    expect(chunks).toEqual(['Short one.\n\nShort two.'])
  })

  it('starts a new chunk once targetSize would be exceeded', async () => {
    const { splitIntoChunks } = await import('@/lib/parsing/pdfToMarkdown')
    const a = 'a'.repeat(60)
    const b = 'b'.repeat(60)
    const chunks = splitIntoChunks(`${a}\n\n${b}`, { targetSize: 100, hardMax: 200 })
    expect(chunks).toEqual([a, b])
  })

  it('hard-splits a single paragraph longer than hardMax on a word boundary', async () => {
    const { splitIntoChunks } = await import('@/lib/parsing/pdfToMarkdown')
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
    const chunks = splitIntoChunks(words, { targetSize: 50, hardMax: 60 })
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(60)
      expect(chunk.endsWith(' ')).toBe(false)
      expect(chunk.startsWith(' ')).toBe(false)
    }
    expect(chunks.join(' ')).toBe(words)
  })
})

describe('pdfToMarkdown', () => {
  it('reformats each chunk through streamChat and concatenates the result', async () => {
    mockStreamChat.mockReturnValueOnce(fakeStream(['# Paragraph ', 'one.']))
    mockStreamChat.mockReturnValueOnce(fakeStream(['# Paragraph ', 'two.']))

    const { pdfToMarkdown } = await import('@/lib/parsing/pdfToMarkdown')
    const markdown = await pdfToMarkdown(Buffer.from('fake-pdf-bytes'))

    expect(markdown).toBe('# Paragraph one.\n\n# Paragraph two.')
    expect(mockStreamChat).toHaveBeenCalledTimes(2)
    expect(mockStreamChat).toHaveBeenNthCalledWith(1, expect.stringContaining('Paragraph one.'))
  })

  it('aborts the whole parse if any chunk reformat fails', async () => {
    mockStreamChat.mockReturnValueOnce(fakeStream(['ok chunk one']))
    mockStreamChat.mockImplementationOnce(() => {
      throw new Error('ollama unreachable')
    })

    const { pdfToMarkdown } = await import('@/lib/parsing/pdfToMarkdown')
    await expect(pdfToMarkdown(Buffer.from('fake-pdf-bytes'))).rejects.toThrow('ollama unreachable')
  })
})
