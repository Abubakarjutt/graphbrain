import type { Editor, Range } from '@tiptap/core'

export interface SlashItem {
  title: string
  keywords: string[]
  group: 'Basic' | 'Media'
  command: (editor: Editor, range: Range) => void
}

export const slashItems: SlashItem[] = [
  {
    title: 'Text',
    keywords: ['text', 'paragraph', 'plain', 'p'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    keywords: ['h1', 'heading', 'title', 'heading1'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    keywords: ['h2', 'heading', 'subtitle', 'heading2'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    keywords: ['h3', 'heading', 'heading3'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'To-do',
    keywords: ['todo', 'task', 'checkbox', 'check'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Bulleted list',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    keywords: ['numbered', 'list', 'ordered', 'ol', 'number'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Quote',
    keywords: ['quote', 'blockquote', 'citation'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Divider',
    keywords: ['divider', 'hr', 'separator', 'rule', 'line'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Code',
    keywords: ['code', 'codeblock', 'pre', 'snippet'],
    group: 'Basic',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Image',
    keywords: ['image', 'photo', 'picture', 'img'],
    group: 'Media',
    command: (editor, range) => {
      const url = window.prompt('Enter image URL')
      if (url) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: 'image', attrs: { src: url } })
          .run()
      }
    },
  },
  {
    title: 'Callout',
    keywords: ['callout', 'note', 'info', 'warning', 'tip'],
    group: 'Media',
    // The callout node requires `block+` content, so seed it with an empty
    // paragraph — inserting a childless callout fails schema validation.
    command: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'callout', content: [{ type: 'paragraph' }] })
        .run(),
  },
  {
    title: 'Toggle',
    keywords: ['toggle', 'collapsible', 'accordion', 'details'],
    group: 'Media',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).insertContent({ type: 'toggle' }).run(),
  },
]

export function filterSlashItems(
  query: string,
  items: SlashItem[] = slashItems,
): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.keywords.some((k) => k.toLowerCase().includes(q)),
  )
}
