import type { Block, TiptapNode } from '@/lib/types/database'

export function pageToText(title: string, blocks: Block[]): string {
  const parts: string[] = [title]

  function walkNode(node: TiptapNode) {
    if (node.text) parts.push(node.text)
    for (const child of node.content ?? []) walkNode(child)
  }

  for (const block of blocks) {
    walkNode(block.content as unknown as TiptapNode)
  }

  return parts.join('\n')
}

export function fileToText(extractedText: string | null): string | null {
  if (!extractedText || extractedText.trim() === '') return null
  return extractedText
}

export function rowToText(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .sort()
    .map(key => `${key}: ${String(fields[key] ?? '')}`)
    .join('\n')
}

export function parseMentions(nodes: TiptapNode[]): string[] {
  const mentions = new Set<string>()

  function walkNode(node: TiptapNode) {
    if (node.text) {
      for (const match of node.text.matchAll(/\[\[(.+?)\]\]/g)) {
        mentions.add(match[1])
      }
    }
    for (const child of node.content ?? []) walkNode(child)
  }

  for (const node of nodes) {
    try { walkNode(node) } catch { /* skip malformed node */ }
  }

  return Array.from(mentions)
}
