'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Database, DatabaseRowLink, Page } from '@/lib/types/database'

interface SidebarDatabaseTreeProps {
  databases: Database[]
  pages: Page[]
  databaseRows: DatabaseRowLink[]
  workspaceId: string
  onCreateDatabase: () => void
}

interface DatabaseNodeProps {
  db: Database
  title: string
  rowPages: Page[]
  workspaceId: string
  isActive: boolean
}

function DatabaseNode({ db, title, rowPages, workspaceId, isActive }: DatabaseNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const hasRows = rowPages.length > 0

  return (
    <div>
      <div
        className={`relative flex items-center gap-1 rounded px-1.5 py-[4px] text-[12px] transition-colors ${
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />
        )}
        {hasRows ? (
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
        <Link
          href={`/workspace/${workspaceId}/database/${db.id}`}
          className="flex items-center gap-1.5 flex-1 truncate min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-muted-foreground" aria-hidden>
            <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M1 4h10M4 4v7" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          <span className="truncate">{title}</span>
        </Link>
      </div>
      {expanded && rowPages.map(rp => (
        <Link
          key={rp.id}
          href={`/workspace/${workspaceId}/page/${rp.id}`}
          className="flex items-center rounded-md text-[12.5px] text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground pl-7 py-1 pr-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {rp.title || 'Untitled'}
        </Link>
      ))}
    </div>
  )
}

export function SidebarDatabaseTree({ databases, pages, databaseRows, workspaceId, onCreateDatabase }: SidebarDatabaseTreeProps) {
  // databaseId param is only populated on the /database/[databaseId] route
  const params = useParams()
  const currentDatabaseId = params?.databaseId as string | undefined

  const workspaceDatabases = databases.filter(d => {
    const containerPage = pages.find(p => p.id === d.page_id)
    return containerPage?.workspace_id === workspaceId
  })

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between px-2 pt-3 pb-1">
        <span className="nav-label">Databases</span>
        <button
          onClick={onCreateDatabase}
          className="grid h-5 w-5 place-items-center rounded text-muted-foreground cursor-pointer transition-colors hover:bg-sidebar-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="New database"
          title="New database"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {workspaceDatabases.map(db => {
        const containerPage = pages.find(p => p.id === db.page_id)
        // A row's page lives wherever it was filed in the page tree, not
        // necessarily under the database's own container page — the
        // database_rows table is the authoritative link, not parent_id.
        const rowPages = databaseRows
          .filter(r => r.database_id === db.id && r.page_id)
          .map(r => pages.find(p => p.id === r.page_id))
          .filter((p): p is Page => Boolean(p))
        return (
          <DatabaseNode
            key={db.id}
            db={db}
            title={containerPage?.title || 'Untitled Database'}
            rowPages={rowPages}
            workspaceId={workspaceId}
            isActive={currentDatabaseId === db.id}
          />
        )
      })}
    </div>
  )
}
