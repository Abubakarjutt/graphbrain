'use client'

import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database, DatabaseRowLink } from '@/lib/types/database'
import { createPage } from '@/lib/actions/pages'
import { createDatabase } from '@/lib/actions/databases'
import { createClient } from '@/lib/supabase/client'
import { SidebarPageTree } from './SidebarPageTree'
import { SidebarDatabaseTree } from './SidebarDatabaseTree'

interface SidebarProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
  databaseRows?: DatabaseRowLink[]
  mobileOpen?: boolean
  onMobileClose?: () => void
  onSearchOpen?: () => void
}

export function Sidebar({ workspaces, user, pages, databases, databaseRows = [], mobileOpen = false, onMobileClose, onSearchOpen }: SidebarProps) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [createDbError, setCreateDbError] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
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
    <aside
      className={`bg-sidebar text-sidebar-foreground flex h-full w-64 flex-shrink-0 flex-col border-r border-sidebar-border select-none
        fixed inset-y-0 left-0 z-30 transition-transform duration-200
        lg:relative lg:translate-x-0 lg:z-auto
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-3 h-14 border-b border-sidebar-border shrink-0">
        <button
          onClick={onMobileClose}
          className="lg:hidden h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Close sidebar"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary shrink-0">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
            <circle cx="9" cy="4.5" r="2.1" fill="var(--primary-foreground)" />
            <circle cx="4" cy="13.5" r="1.7" fill="var(--primary-foreground)" opacity="0.75" />
            <circle cx="14" cy="13.5" r="1.7" fill="var(--primary-foreground)" opacity="0.75" />
            <path d="M9 6.6 4.8 11.9M9 6.6l4.2 5.3M4.8 13.5h8.4" stroke="var(--primary-foreground)" strokeWidth="1" opacity="0.5" />
          </svg>
        </span>
        <span className="font-display text-[16px] font-medium tracking-tight text-sidebar-foreground">graphbrain</span>
      </div>

      {/* Search */}
      <div className="px-2.5 pt-3 pb-1">
        <button
          className="flex items-center gap-2 w-full px-2.5 py-2 text-sm text-muted-foreground bg-sidebar-accent/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors rounded-md text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Search"
          onClick={onSearchOpen}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden>
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[11px] text-muted-foreground font-mono">⌘K</kbd>
        </button>
      </div>

      {/* Ask */}
      {currentWorkspaceId && (
        <div className="px-2.5 pb-2">
          <Link
            href={`/workspace/${currentWorkspaceId}/ask`}
            className={`flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
              pathname?.endsWith('/ask')
                ? 'bg-spark/15 text-spark font-medium'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 11 11" fill="none" className="shrink-0" aria-hidden>
              <path d="M5.5 1 6.7 4.3 10 5.5 6.7 6.7 5.5 10 4.3 6.7 1 5.5 4.3 4.3z" fill="currentColor" />
            </svg>
            <span className="flex-1 text-left">Ask</span>
          </Link>
        </div>
      )}

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5" aria-label="Main navigation">
        {/* Workspace list */}
        <p className="nav-label px-2 pt-3 pb-1">Workspace</p>
        {workspaces.map(({ workspaces: ws }) =>
          ws ? (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className={`relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                currentWorkspaceId === ws.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              }`}
            >
              {currentWorkspaceId === ws.id && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-semibold text-primary-foreground"
                style={{ background: currentWorkspaceId === ws.id ? 'var(--primary)' : 'var(--muted-foreground)' }}
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
              databaseRows={databaseRows}
              workspaceId={currentWorkspaceId}
              onCreateDatabase={handleCreateDatabase}
            />
          </>
        )}

        {/* New page */}
        {currentWorkspaceId && (
          <button
            onClick={() => handleCreatePage(null)}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            New page
          </button>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent/60 transition-colors w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {userInitial}
            </span>
            <p className="truncate text-[12.5px] text-sidebar-foreground/85 flex-1 text-left">{user.email}</p>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-muted-foreground shrink-0" aria-hidden>
              <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
              <circle cx="6.5" cy="2.5" r="1" fill="currentColor" />
              <circle cx="6.5" cy="10.5" r="1" fill="currentColor" />
            </svg>
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-[9]" aria-hidden onClick={() => setUserMenuOpen(false)} />
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-md shadow-lg z-10 py-1 animate-fade-in">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const supabase = createClient()
                      await supabase.auth.signOut()
                      window.location.href = '/login'
                    } catch {
                      setUserMenuOpen(false)
                    }
                  }}
                  className="w-full cursor-pointer text-left px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
