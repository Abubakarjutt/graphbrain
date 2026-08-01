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
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ workspaces, user, pages, databases, mobileOpen = false, onMobileClose }: SidebarProps) {
  const params = useParams()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [createDbError, setCreateDbError] = useState<string | null>(null)
  const currentWorkspaceId = params?.workspaceId as string | undefined

  const databasePageIds = new Set(databases.map(d => d.page_id))
  const regularPages = pages.filter(
    p => !databasePageIds.has(p.id) && !databasePageIds.has(p.parent_id ?? '')
  )

  const currentWorkspace = workspaces.find(w => w.workspace_id === currentWorkspaceId)?.workspaces

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
    <aside
      className={`bg-sidebar text-sidebar-foreground flex h-full w-60 flex-shrink-0 flex-col border-r border-sidebar-border select-none
        fixed inset-y-0 left-0 z-30 transition-transform duration-200
        lg:relative lg:translate-x-0 lg:z-auto
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Brand + workspace header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-sidebar-border">
        <button
          onClick={onMobileClose}
          className="lg:hidden h-5 w-5 grid place-items-center text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors shrink-0 mr-0.5"
          aria-label="Close sidebar"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <span className="grid h-5 w-5 place-items-center rounded-[3px] border border-[var(--gold)]/40 bg-[var(--gold)]/10 shrink-0">
          <svg width="10" height="10" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M4 13.5 9 4l5 9.5" stroke="rgba(180,150,90,0.6)" strokeWidth="1" />
            <circle cx="9" cy="4" r="2" fill="#b89650" />
            <circle cx="4" cy="13.5" r="1.6" fill="#b89650" />
            <circle cx="14" cy="13.5" r="1.6" fill="#b89650" />
          </svg>
        </span>
        <span className="font-display text-sm font-semibold tracking-tight text-sidebar-foreground">graphbrain</span>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5">
        <button
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-sidebar-foreground/75 hover:bg-black/[0.06] hover:text-sidebar-foreground transition-colors rounded-[4px] text-left"
          aria-label="Search"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[11px] text-sidebar-foreground/45 font-mono">⌘K</kbd>
        </button>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-1 pb-2">
        {/* Workspace list */}
        <p className="font-display italic px-2 pt-3 pb-1 text-[11px] text-sidebar-foreground/60 tracking-wide">
          Workspaces
        </p>
        {workspaces.map(({ workspaces: ws }) =>
          ws ? (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className={`relative flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-[13px] transition-colors ${
                currentWorkspaceId === ws.id
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/78 hover:bg-black/[0.06] hover:text-sidebar-foreground'
              }`}
            >
              {currentWorkspaceId === ws.id && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--gold-deep)]" />
              )}
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-[3px] text-[10px] font-semibold text-white"
                style={{ background: currentWorkspaceId === ws.id ? 'oklch(0.45 0.02 75)' : 'oklch(0.60 0.01 75)' }}
              >
                {ws.name[0].toUpperCase()}
              </span>
              <span className="truncate">{ws.name}</span>
            </Link>
          ) : null
        )}

        {/* Pages + databases for active workspace */}
        {currentWorkspaceId && (
          <>
            <SidebarPageTree
              pages={regularPages.filter(p => p.workspace_id === currentWorkspaceId)}
              workspaceId={currentWorkspaceId}
              onCreatePage={handleCreatePage}
            />
            {createDbError && (
              <p className="px-2 py-1 text-xs text-destructive">{createDbError}</p>
            )}
            <SidebarDatabaseTree
              databases={databases}
              pages={pages}
              workspaceId={currentWorkspaceId}
              onCreateDatabase={handleCreateDatabase}
            />
          </>
        )}

        {/* New page */}
        {currentWorkspaceId && (
          <button
            onClick={() => handleCreatePage(null)}
            className="mt-1 flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-[13px] text-sidebar-foreground/65 hover:bg-black/[0.06] hover:text-sidebar-foreground transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            New page
          </button>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border px-2 py-1.5">
        <div className="flex items-center gap-2 rounded-[4px] px-2 py-1.5 hover:bg-black/[0.04] cursor-pointer transition-colors">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-stone-400 to-stone-600 text-xs font-semibold text-white">
            {userInitial}
          </span>
          <p className="truncate text-[12px] text-sidebar-foreground/72 flex-1">{user.email}</p>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-sidebar-foreground/45 shrink-0" aria-hidden>
            <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
            <circle cx="6.5" cy="2.5" r="1" fill="currentColor" />
            <circle cx="6.5" cy="10.5" r="1" fill="currentColor" />
          </svg>
        </div>
      </div>
    </aside>
  )
}
