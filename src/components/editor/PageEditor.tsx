'use client'

import { useState, useTransition } from 'react'
import { BlockEditor } from './BlockEditor'
import { updatePageTitle, saveBlocks } from '@/lib/actions/pages'
import type { TiptapDocument } from '@/lib/types/database'

interface PageEditorProps {
  pageId: string
  workspaceId: string
  initialTitle: string
  initialDoc: TiptapDocument
}

export function PageEditor({ pageId, workspaceId, initialTitle, initialDoc }: PageEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleTitleBlur() {
    startTransition(async () => {
      try {
        await updatePageTitle(pageId, workspaceId, title)
        setSaveError(null)
      } catch {
        setSaveError('Failed to save title')
      }
    })
  }

  function handleSave(doc: TiptapDocument) {
    startTransition(async () => {
      try {
        await saveBlocks(pageId, workspaceId, doc)
        setSaveError(null)
      } catch {
        setSaveError('Failed to save content')
      }
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      {saveError && (
        <p className="text-sm text-destructive mb-4">{saveError}</p>
      )}
      <input
        className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-6 placeholder:text-muted-foreground"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Untitled"
        aria-label="Page title"
      />
      <BlockEditor doc={initialDoc} onSave={handleSave} />
    </div>
  )
}
