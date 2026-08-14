import mammoth from 'mammoth'
import TurndownService from 'turndown'

export async function docxToMarkdown(buffer: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer })
  const turndown = new TurndownService()
  return turndown.turndown(html)
}
