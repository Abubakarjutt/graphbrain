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
        className={`relative flex items-center gap-1 group rounded-md px-1.5 py-[5px] text-[13px] transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'hover:bg-sidebar-accent/60 text-sidebar-foreground/85 hover:text-sidebar-foreground'}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />
        )}
        {children.length > 0 ? (
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-4 h-4 flex items-center justify-center shrink-0 rounded-sm text-muted-foreground cursor-pointer transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          >
            <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden>
              <path d="M1.5 1.5 6.5 5 1.5 8.5z" />
            </svg>
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0 flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-current opacity-20" aria-hidden />
          </span>
        )}
        <Link href={`/workspace/${workspaceId}/page/${page.id}`} className="flex items-center gap-1.5 flex-1 truncate min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-muted-foreground" aria-hidden>
            <path d="M3 2h5.5L10 3.5V11H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M8.5 2v1.5H10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
          <span className="truncate">{page.title || 'Untitled'}</span>
        </Link>
        <button
          onClick={() => onCreatePage(page.id)}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-4 h-4 flex items-center justify-center rounded-sm text-muted-foreground cursor-pointer transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
      <div className="flex items-center justify-between px-2 pt-3 pb-1">
        <span className="nav-label">Docs</span>
        <button
          onClick={() => onCreatePage(null)}
          className="grid h-5 w-5 place-items-center rounded text-muted-foreground cursor-pointer transition-colors hover:bg-sidebar-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
          className="mx-0.5 mt-1 flex w-[calc(100%-0.25rem)] items-center gap-2 rounded-md border border-dashed border-sidebar-border px-2.5 py-2 text-sm text-muted-foreground cursor-pointer transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
