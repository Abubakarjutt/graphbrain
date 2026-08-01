'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Page } from '@/lib/types/database'

interface SidebarPageTreeProps {
  pages: Page[]
  workspaceId: string
  onCreatePage: (parentId: string | null) => void
}

interface PageNodeProps {
  page: Page
  pages: Page[]
  workspaceId: string
  depth: number
  onCreatePage: (parentId: string | null) => void
}

const MAX_DEPTH = 10

function PageNode({ page, pages, workspaceId, depth, onCreatePage }: PageNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const params = useParams()
  const currentPageId = params?.pageId as string | undefined
  const children = depth < MAX_DEPTH ? pages.filter(p => p.parent_id === page.id) : []
  const isActive = currentPageId === page.id

  return (
    <div>
      <div
        className={`flex items-center gap-1 group rounded-[4px] px-1.5 py-[3px] text-[13px] transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-black/[0.06] text-sidebar-foreground/78 hover:text-sidebar-foreground'}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-4 h-4 flex items-center justify-center shrink-0 text-sidebar-foreground/40 transition-transform"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{ transform: children.length > 0 && expanded ? 'rotate(90deg)' : undefined }}
        >
          {children.length > 0 ? (
            <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden>
              <path d="M1.5 1.5 6.5 5 1.5 8.5z" />
            </svg>
          ) : null}
        </button>
        <Link href={`/workspace/${workspaceId}/page/${page.id}`} className="flex items-center gap-1.5 flex-1 truncate min-w-0">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 opacity-50" aria-hidden>
            <path d="M3 2h5.5L10 3.5V11H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M8.5 2v1.5H10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
          <span className="truncate">{page.title || 'Untitled'}</span>
        </Link>
        <button
          onClick={() => onCreatePage(page.id)}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-sidebar-foreground/45 transition-colors hover:text-[var(--gold-deep)]"
          aria-label="New subpage"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {expanded && children.map(child => (
        <PageNode
          key={child.id}
          page={child}
          pages={pages}
          workspaceId={workspaceId}
          depth={depth + 1}
          onCreatePage={onCreatePage}
        />
      ))}
    </div>
  )
}

export function SidebarPageTree({ pages, workspaceId, onCreatePage }: SidebarPageTreeProps) {
  const roots = pages.filter(p => p.parent_id === null)

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="font-display italic text-[11px] text-sidebar-foreground/60 tracking-wide">
          Docs
        </span>
        <button
          onClick={() => onCreatePage(null)}
          className="grid h-5 w-5 place-items-center rounded text-sidebar-foreground/45 transition-colors hover:bg-black/[0.06] hover:text-[var(--gold-deep)]"
          aria-label="New doc"
          title="New doc"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {roots.length === 0 ? (
        <button
          onClick={() => onCreatePage(null)}
          className="mx-2 mt-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md border border-dashed border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground/45 transition-colors hover:border-[var(--gold-deep)]/50 hover:text-[var(--gold-deep)]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          New doc
        </button>
      ) : (
        roots.map(page => (
          <PageNode
            key={page.id}
            page={page}
            pages={pages}
            workspaceId={workspaceId}
            depth={0}
            onCreatePage={onCreatePage}
          />
        ))
      )}
    </div>
  )
}
