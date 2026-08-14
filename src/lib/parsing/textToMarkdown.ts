export function textToMarkdown(buffer: Buffer): string {
  const text = buffer.toString('utf-8')
  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .join('\n\n')
}
