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
      <div className="flex items-center px-3 py-1 justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Databases</span>
        <button
          onClick={onCreateDatabase}
          className="text-muted-foreground hover:text-foreground text-sm"
          aria-label="New database"
        >
          +
        </button>
      </div>
      {workspaceDatabases.map(db => {
        const containerPage = pages.find(p => p.id === db.page_id)
        // Row pages have parent_id = database container page_id (set by createRow server action)
        const rowPages = pages.filter(p => p.parent_id === db.page_id)
        const isActive = currentDatabaseId === db.id
        return (
          <div key={db.id}>
            <Link
              href={`/workspace/${workspaceId}/database/${db.id}`}
              className={`flex items-center rounded-md px-3 py-1 text-sm ${
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              {containerPage?.title || 'Untitled Database'}
            </Link>
            {rowPages.map(rp => (
              <Link
                key={rp.id}
                href={`/workspace/${workspaceId}/page/${rp.id}`}
                className="flex items-center rounded-md text-sm hover:bg-accent/50 text-muted-foreground pl-6 py-1 pr-2"
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
