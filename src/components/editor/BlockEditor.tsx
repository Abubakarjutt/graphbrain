'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorToolbar } from './EditorToolbar'
import type { TiptapDocument } from '@/lib/types/database'

interface BlockEditorProps {
  doc: TiptapDocument
  onSave: (doc: TiptapDocument) => void
}

export function BlockEditor({ doc, onSave }: BlockEditorProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: doc.content.length > 0 ? doc : { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: { class: 'prose max-w-none focus:outline-none min-h-[200px] p-4' },
    },
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSave(editor.getJSON() as TiptapDocument)
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

  return (
    <div className="flex flex-col border rounded-md overflow-hidden">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
