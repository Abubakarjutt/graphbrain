'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { MarkdownRules } from '@/components/editor/extensions/markdown-rules'
import type { TiptapDocument } from '@/lib/types/database'

interface BlockEditorProps {
  doc: TiptapDocument
  onSave: (doc: TiptapDocument) => void
}

export function BlockEditor({ doc, onSave }: BlockEditorProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep ref up to date so the onUpdate closure never captures a stale prop
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave }, [onSave])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Type '/' for commands" }),
      MarkdownRules,
    ],
    content: doc.content.length > 0 ? doc : { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: { class: 'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[60vh]' },
    },
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSaveRef.current(editor.getJSON() as TiptapDocument)
      }, 1000)
    },
  })

  useEffect(() => {
    if (editor && doc && doc.content.length > 0) {
      const current = JSON.stringify(editor.getJSON())
      const incoming = JSON.stringify(doc)
      if (current !== incoming) {
        editor.commands.setContent(doc)
      }
    }
  }, [editor, doc])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  if (!editor) return null

  return <EditorContent editor={editor} />
}
