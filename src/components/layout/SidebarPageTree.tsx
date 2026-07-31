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
        className={`flex items-center gap-1 group rounded-md px-2 py-1 text-sm ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground'}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-4 h-4 flex items-center justify-center text-xs shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {children.length > 0 ? (expanded ? '▾' : '▸') : ' '}
        </button>
        <Link href={`/workspace/${workspaceId}/page/${page.id}`} className="flex-1 truncate">
          {page.title || 'Untitled'}
        </Link>
        <button
          onClick={() => onCreatePage(page.id)}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 text-xs"
          aria-label="New subpage"
        >
          +
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
      <div className="flex items-center px-3 py-1 justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pages</span>
        <button
          onClick={() => onCreatePage(null)}
          className="text-muted-foreground hover:text-foreground text-sm"
          aria-label="New page"
        >
          +
        </button>
      </div>
      {roots.map(page => (
        <PageNode
          key={page.id}
          page={page}
          pages={pages}
          workspaceId={workspaceId}
          depth={0}
          onCreatePage={onCreatePage}
        />
      ))}
    </div>
  )
}
