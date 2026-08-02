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
  workspaceName?: string
}

export function PageEditor({ pageId, workspaceId, initialTitle, initialDoc, fileAttachments = [], workspaceName }: PageEditorProps) {
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
    <div className="flex flex-col h-full">
      {/* Sticky top header — breadcrumb + actions */}
      <div className="sticky top-0 z-10 h-11 flex items-center justify-between px-5 bg-background/95 backdrop-blur-sm border-b border-border/40 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          {workspaceName && (
            <>
              <span className="text-muted-foreground/60 truncate">{workspaceName}</span>
              <svg width="5" height="9" viewBox="0 0 5 9" fill="none" className="text-muted-foreground/30 shrink-0" aria-hidden>
                <path d="M1 1l3 3.5L1 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
          <span className="text-muted-foreground/80 truncate font-medium">{title || 'Untitled'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground border border-border/70 hover:bg-accent hover:text-foreground hover:border-border px-2.5 py-1 rounded transition-colors"
            type="button"
          >
            Share
          </button>
          <button
            className="h-7 w-7 grid place-items-center text-muted-foreground hover:bg-accent hover:text-foreground rounded transition-colors"
            type="button"
            aria-label="More options"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="3.5" r="1.1" fill="currentColor" />
              <circle cx="7" cy="7" r="1.1" fill="currentColor" />
              <circle cx="7" cy="10.5" r="1.1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto bg-muted/40">
        <div className="max-w-[720px] mx-auto px-14 pt-14 pb-16 min-h-full bg-background shadow-sm">
          {saveError && (
            <p className="text-sm text-destructive mb-4">{saveError}</p>
          )}

          {/* Page icon */}
          <div className="mb-3 -ml-1">
            <span className="inline-grid h-10 w-10 place-items-center rounded-lg bg-accent border border-border">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-accent-foreground">
                <path d="M5 3h9.5L18 6.5V19H5V3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M14.5 3v3.5H18" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M8 10.5h6M8 13.5h6M8 16.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
          </div>

          {/* Title */}
          <input
            className="w-full text-[2.5rem] leading-[1.15] font-bold bg-transparent border-none outline-none mb-5 placeholder:text-muted-foreground/25 text-foreground"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            aria-label="Page title"
          />

          {/* Editor */}
          <BlockEditor doc={initialDoc} onSave={handleSave} />

          {/* Attachments */}
          <div className="mt-10 border-t border-border/40 pt-5">
            <h2 className="text-xs font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">Attachments</h2>
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
      </div>
    </div>
  )
}
