import { streamChat } from '@/lib/graph/ollama'

export function splitIntoChunks(text: string, opts: { targetSize: number; hardMax: number }): string[] {
  const { targetSize, hardMax } = opts
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  function flush() {
    if (current) chunks.push(current)
    current = ''
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > hardMax) {
      flush()
      chunks.push(...splitLongParagraph(paragraph, hardMax))
      continue
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > targetSize && current) {
      flush()
      current = paragraph
    } else {
      current = candidate
    }
  }
  flush()
  return chunks
}

function splitLongParagraph(paragraph: string, hardMax: number): string[] {
  const pieces: string[] = []
  let remaining = paragraph
  while (remaining.length > hardMax) {
    let cut = remaining.lastIndexOf(' ', hardMax)
    if (cut <= 0) cut = hardMax
    pieces.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  if (remaining) pieces.push(remaining)
  return pieces
}

async function reformatChunk(chunk: string): Promise<string> {
  const prompt = [
    'Reformat the following extracted PDF text into clean markdown.',
    'Infer headings, lists, and emphasis from context. Do not add commentary,',
    'do not summarize, preserve all content. Output markdown only.',
    '',
    'Text:',
    chunk,
  ].join('\n')

  let result = ''
  for await (const token of streamChat(prompt)) {
    result += token
  }
  return result
}

export async function pdfToMarkdown(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const { text } = await parser.getText()

  const chunks = splitIntoChunks(text, { targetSize: 25, hardMax: 100 })
  const reformatted: string[] = []
  for (const chunk of chunks) {
    reformatted.push(await reformatChunk(chunk))
  }
  return reformatted.join('\n\n')
}
