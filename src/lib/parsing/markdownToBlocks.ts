import { marked } from 'marked'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import type { TiptapDocument } from '@/lib/types/database'

// Same extension set BlockEditor uses, minus editor-interaction-only
// extensions (Placeholder/SlashCommand/MarkdownRules) that add no schema
// nodes, and minus Callout/Toggle, which standard markdown has no syntax
// for — imported docs should never produce those node types.
const EXTENSIONS = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ inline: false, allowBase64: false }),
]

export function markdownToBlocks(markdown: string): TiptapDocument {
  const html = marked.parse(markdown, { async: false }) as string
  return generateJSON(html, EXTENSIONS) as TiptapDocument
}
