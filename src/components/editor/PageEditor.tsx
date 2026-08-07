'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BlockEditor } from './BlockEditor'
import { updatePageTitle, saveBlocks, deletePage } from '@/lib/actions/pages'
import { FileUploadButton } from '@/components/files/FileUploadButton'
import type { TiptapDocument } from '@/lib/types/database'

interface FileAttachment {
  pageId: string
  filename: string
}

interface BacklinkEntry {
  id: string
  title: string
}

const BACKLINKS_FOLD = 5

function LinkedFrom({ backlinks, title, workspaceId }: { backlinks: BacklinkEntry[]; title: string; workspaceId: string }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? backlinks : backlinks.slice(0, BACKLINKS_FOLD)
  const overflow = backlinks.length - BACKLINKS_FOLD

  return (
    <div className="mt-10 border-t border-border/40 pt-5">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">Linked from</h2>
        {backlinks.length > 0 && (
          <span className="text-[11px] text-muted-foreground/35 tabular-nums font-medium">{backlinks.length}</span>
        )}
      </div>

      {backlinks.length === 0 ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground/40">No pages link here yet.</p>
          <p className="text-xs text-muted-foreground/30">
            Write{' '}
            <code className="font-mono text-[11px] bg-muted/60 px-1 py-0.5 rounded text-muted-foreground/50">
              [[{title || 'this page'}]]
            </code>{' '}
            in any page to create a backlink.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map(link => (
            <li key={link.id} className="flex items-center gap-2 min-w-0">
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary/35 shrink-0"
                aria-hidden
              />
              <Link
                href={`/workspace/${workspaceId}/page/${link.id}`}
                className="text-sm text-foreground/70 hover:text-foreground hover:underline transition-colors truncate"
              >
                {link.title}
              </Link>
            </li>
          ))}
          {overflow > 0 && !showAll && (
            <li className="pl-3.5">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded cursor-pointer"
              >
                Show {overflow} more
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

interface PageEditorProps {
  pageId: string
  workspaceId: string
  initialTitle: string
  initialDoc: TiptapDocument
  fileAttachments?: FileAttachment[]
  workspaceName?: string
  backlinks?: BacklinkEntry[]
}

export function PageEditor({ pageId, workspaceId, initialTitle, initialDoc, fileAttachments = [], workspaceName, backlinks = [] }: PageEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [menuOpen, setMenuOpen] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [attachments, setAttachments] = useState<FileAttachment[]>(fileAttachments)
  const [, startTransition] = useTransition()
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current) }, [])

  function markSaved() {
    setSaveStatus('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
  }

  function handleTitleBlur() {
    const trimmed = title.trim()
    if (!trimmed) {
      setTitle(initialTitle || 'Untitled')
      return
    }
    setSaveStatus('saving')
    startTransition(async () => {
      try {
        await updatePageTitle(pageId, workspaceId, trimmed)
        markSaved()
      } catch {
        setSaveStatus('error')
      }
    })
  }

  function handleSave(doc: TiptapDocument) {
    setSaveStatus('saving')
    startTransition(async () => {
      try {
        await saveBlocks(pageId, workspaceId, doc, title)
        markSaved()
      } catch {
        setSaveStatus('error')
      }
    })
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // Clipboard unavailable (non-HTTPS or permission denied) — no-op
    }
  }

  async function handleDeletePage() {
    if (!confirm('Delete this page? This cannot be undone.')) return
    try {
      await deletePage(pageId, workspaceId)
      router.push(`/workspace/${workspaceId}`)
    } catch {
      setSaveStatus('error')
    }
  }

  function handleFileCreated(newPageId: string, filename: string) {
    setAttachments(prev => [...prev, { pageId: newPageId, filename }])
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky top header — breadcrumb + actions */}
      <div className="sticky top-0 z-10 h-10 flex items-center justify-between px-4 bg-background/95 backdrop-blur-sm border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 font-mono text-xs">
          {workspaceName && (
            <>
              <Link href={`/workspace/${workspaceId}`} className="text-muted-foreground/50 hover:text-muted-foreground truncate transition-colors">
                {workspaceName}
              </Link>
              <span className="text-muted-foreground/30 shrink-0 select-none">/</span>
            </>
          )}
          <span className="text-muted-foreground/70 truncate">{title || 'Untitled'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {saveStatus === 'saving' && <span className="text-[10px] font-mono text-muted-foreground/50 mr-1 tracking-tight">saving…</span>}
          {saveStatus === 'saved' && <span className="text-[10px] font-mono text-muted-foreground/50 mr-1 tracking-tight">saved</span>}
          {saveStatus === 'error' && <span className="text-[10px] font-mono text-destructive mr-1 tracking-tight">save failed</span>}
          <button
            className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70 border border-border hover:bg-accent hover:text-foreground hover:border-border px-2 py-0.5 rounded transition-colors cursor-pointer tracking-tight"
            type="button"
            onClick={handleShare}
          >
            {copySuccess ? 'copied!' : 'share'}
          </button>
          <div className="relative">
            <button
              className="h-6 w-6 grid place-items-center text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded transition-colors cursor-pointer"
              type="button"
              aria-label="More options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(v => !v)}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                <circle cx="7" cy="3.5" r="1.1" fill="currentColor" />
                <circle cx="7" cy="7" r="1.1" fill="currentColor" />
                <circle cx="7" cy="10.5" r="1.1" fill="currentColor" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded shadow-lg z-20 py-1 animate-fade-in-down">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); handleDeletePage() }}
                    className="w-full cursor-pointer text-left px-3 py-2 text-xs text-destructive hover:bg-accent transition-colors"
                  >
                    Delete page
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto bg-muted/30">
        <div className="max-w-[680px] mx-auto px-12 pt-12 pb-16 min-h-full bg-background shadow-sm">
          {/* Title */}
          <input
            className="font-display w-full text-[2.5rem] leading-[1.12] font-light tracking-[-0.01em] bg-transparent border-none outline-none mb-7 placeholder:text-muted-foreground/20 text-foreground"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            aria-label="Page title"
            autoFocus={!initialTitle || initialTitle === 'Untitled'}
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

          <LinkedFrom backlinks={backlinks} title={title} workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  )
}
