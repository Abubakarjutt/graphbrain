'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'
import { createPage } from '@/lib/actions/pages'
import { createDatabase } from '@/lib/actions/databases'
import { SidebarPageTree } from './SidebarPageTree'
import { SidebarDatabaseTree } from './SidebarDatabaseTree'

interface SidebarProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
}

export function Sidebar({ workspaces, user, pages, databases }: SidebarProps) {
  const params = useParams()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [createDbError, setCreateDbError] = useState<string | null>(null)
  const currentWorkspaceId = params?.workspaceId as string | undefined

  // Exclude database container pages and their direct children (row pages) from the Pages section
  const databasePageIds = new Set(databases.map(d => d.page_id))
  const regularPages = pages.filter(
    p => !databasePageIds.has(p.id) && !databasePageIds.has(p.parent_id ?? '')
  )

  function handleCreatePage(parentId: string | null) {
    if (!currentWorkspaceId) return
    startTransition(async () => {
      const page = await createPage(currentWorkspaceId, parentId)
      router.push(`/workspace/${currentWorkspaceId}/page/${page.id}`)
    })
  }

  function handleCreateDatabase() {
    if (!currentWorkspaceId) return
    startTransition(async () => {
      try {
        const { database } = await createDatabase(currentWorkspaceId)
        setCreateDbError(null)
        router.push(`/workspace/${currentWorkspaceId}/database/${database.id}`)
      } catch (err) {
        setCreateDbError(err instanceof Error ? err.message : 'Failed to create database')
      }
    })
  }

  const userInitial = (user.email?.[0] ?? '?').toUpperCase()

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex h-full w-64 flex-shrink-0 flex-col border-r border-sidebar-border">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/10">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M4 13.5 9 4l5 9.5" stroke="rgba(226,198,138,0.5)" strokeWidth="1" />
            <circle cx="9" cy="4" r="2" fill="#e2c68a" />
            <circle cx="4" cy="13.5" r="1.6" fill="#e2c68a" />
            <circle cx="14" cy="13.5" r="1.6" fill="#e2c68a" />
          </svg>
        </span>
        <span className="font-display text-lg tracking-tight text-sidebar-foreground">graphbrain</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        <p className="px-3 pt-2 pb-1 text-[0.65rem] font-medium tracking-[0.18em] text-sidebar-foreground/35 uppercase">
          Workspaces
        </p>
        {workspaces.map(({ workspaces: ws }) =>
          ws ? (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className={`relative block rounded-md px-3 py-2 text-sm transition-colors ${
                currentWorkspaceId === ws.id
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:bg-black/[0.04] hover:text-sidebar-foreground'
              }`}
            >
              {currentWorkspaceId === ws.id && (
                <span className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--gold)]" />
              )}
              {ws.name}
            </Link>
          ) : null
        )}
        {currentWorkspaceId && (
          <>
            <SidebarPageTree
              pages={regularPages.filter(p => p.workspace_id === currentWorkspaceId)}
              workspaceId={currentWorkspaceId}
              onCreatePage={handleCreatePage}
            />
            {createDbError && (
              <p className="px-3 py-1 text-xs text-destructive">{createDbError}</p>
            )}
            <SidebarDatabaseTree
              databases={databases}
              pages={pages}
              workspaceId={currentWorkspaceId}
              onCreateDatabase={handleCreateDatabase}
            />
          </>
        )}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#d4c4a0,#b8a070)] text-xs font-semibold text-white">
          {userInitial}
        </span>
        <p className="truncate text-xs text-sidebar-foreground/50">{user.email}</p>
      </div>
    </aside>
  )
}
