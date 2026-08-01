'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Database, Page } from '@/lib/types/database'

interface SidebarDatabaseTreeProps {
  databases: Database[]
  pages: Page[]
  workspaceId: string
  onCreateDatabase: () => void
}

export function SidebarDatabaseTree({ databases, pages, workspaceId, onCreateDatabase }: SidebarDatabaseTreeProps) {
  // databaseId param is only populated on the /database/[databaseId] route (Task 8)
  const params = useParams()
  const currentDatabaseId = params?.databaseId as string | undefined

  const workspaceDatabases = databases.filter(d => {
    const containerPage = pages.find(p => p.id === d.page_id)
    return containerPage?.workspace_id === workspaceId
  })

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="font-display italic text-[11px] text-sidebar-foreground/60 tracking-wide">
          Databases
        </span>
        <button
          onClick={onCreateDatabase}
          className="grid h-5 w-5 place-items-center rounded text-sidebar-foreground/45 transition-colors hover:bg-black/[0.06] hover:text-[var(--gold-deep)]"
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
        const rowPages = pages.filter(p => p.parent_id === db.page_id)
        const isActive = currentDatabaseId === db.id
        return (
          <div key={db.id}>
            <Link
              href={`/workspace/${workspaceId}/database/${db.id}`}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] transition-colors ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/78 hover:bg-black/[0.06] hover:text-sidebar-foreground'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-60" aria-hidden>
                <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M1 4h10M4 4v7" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              {containerPage?.title || 'Untitled Database'}
            </Link>
            {rowPages.map(rp => (
              <Link
                key={rp.id}
                href={`/workspace/${workspaceId}/page/${rp.id}`}
                className="flex items-center rounded-md text-[12px] text-sidebar-foreground/70 hover:bg-black/[0.06] hover:text-sidebar-foreground pl-8 py-1 pr-2 transition-colors"
              >
                {rp.title || 'Untitled'}
              </Link>
            ))}
          </div>
        )
      })}
    </div>
  )
}
