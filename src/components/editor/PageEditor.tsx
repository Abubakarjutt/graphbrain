'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { BlockEditor } from './BlockEditor'
import { updatePageTitle, saveBlocks } from '@/lib/actions/pages'
import { FileUploadButton } from '@/components/files/FileUploadButton'
import type { TiptapDocument } from '@/lib/types/database'

interface FileAttachment {
  pageId: string
  filename: string
}

interface PageEditorProps {
  pageId: string
  workspaceId: string
  initialTitle: string
  initialDoc: TiptapDocument
  fileAttachments?: FileAttachment[]
}

export function PageEditor({ pageId, workspaceId, initialTitle, initialDoc, fileAttachments = [] }: PageEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<FileAttachment[]>(fileAttachments)
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
        await saveBlocks(pageId, workspaceId, doc, title)
        setSaveError(null)
      } catch {
        setSaveError('Failed to save content')
      }
    })
  }

  function handleFileCreated(newPageId: string, filename: string) {
    setAttachments(prev => [...prev, { pageId: newPageId, filename }])
  }

  return (
    <div className="max-w-2xl mx-auto px-12 pt-20 pb-16">
      {saveError && (
        <p className="text-sm text-destructive mb-4">{saveError}</p>
      )}
      <input
        className="w-full text-[2.75rem] leading-tight font-semibold font-display bg-transparent border-none outline-none mb-6 placeholder:text-muted-foreground/30 tracking-tight"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Untitled"
        aria-label="Page title"
      />
      <BlockEditor doc={initialDoc} onSave={handleSave} />

      <div className="mt-10 border-t border-border/50 pt-6">
        <h2 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">Attachments</h2>
        {attachments.length > 0 && (
          <ul className="space-y-1 mb-3">
            {attachments.map(a => (
              <li key={a.pageId}>
                <Link
                  href={`/workspace/${workspaceId}/page/${a.pageId}`}
                  className="text-sm hover:underline text-foreground"
                >
                  {a.filename}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <FileUploadButton
          pageId={pageId}
          workspaceId={workspaceId}
          onFileCreated={handleFileCreated}
        />
      </div>
    </div>
  )
}
