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
  const isSettings = pathname?.includes('/settings')

  return (
    <aside
      className={`flex h-full w-[220px] flex-shrink-0 flex-col select-none
        fixed inset-y-0 left-0 z-30 transition-transform duration-200
        lg:relative lg:translate-x-0 lg:z-auto
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      {/* ── Brand ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 px-4 h-[52px] shrink-0"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <button
          onClick={onMobileClose}
          className="lg:hidden h-6 w-6 grid place-items-center rounded-md cursor-pointer transition-colors shrink-0 hover:bg-sidebar-accent"
          style={{ color: 'var(--sidebar-foreground)', opacity: 0.4 }}
          aria-label="Close sidebar"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        {/* Graph-brain logo mark */}
        <span
          className="grid h-6 w-6 place-items-center rounded-md shrink-0"
          style={{ background: 'var(--sidebar-primary)', boxShadow: '0 1px 3px oklch(0 0 0 / 0.18)' }}
        >
          <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden>
            <circle cx="9" cy="4.5" r="2.1" fill="var(--sidebar-primary-foreground)" />
            <circle cx="4" cy="13.5" r="1.7" fill="var(--sidebar-primary-foreground)" opacity="0.75" />
            <circle cx="14" cy="13.5" r="1.7" fill="var(--sidebar-primary-foreground)" opacity="0.75" />
            <path d="M9 6.6 4.8 11.9M9 6.6l4.2 5.3M4.8 13.5h8.4" stroke="var(--sidebar-primary-foreground)" strokeWidth="1" opacity="0.5" />
          </svg>
        </span>

        <span
          className="font-display text-[15px] font-medium leading-none tracking-tight"
          style={{ color: 'var(--sidebar-foreground)' }}
        >
          graphbrain
        </span>
      </div>

      {/* ── Search ─────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-1.5">
        <button
          onClick={onSearchOpen}
          className="flex items-center gap-2 w-full h-8 px-2.5 text-[12px] rounded-lg transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--sidebar-ring)] hover:bg-sidebar-accent group"
          style={{
            color: 'var(--sidebar-foreground)',
            background: 'oklch(0 0 0 / 4%)',
            border: '1px solid var(--sidebar-border)',
          }}
          aria-label="Search"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"
            className="shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" aria-hidden>
            <circle cx="6" cy="6" r="4.2" />
            <path d="M9.5 9.5l2.5 2.5" strokeLinecap="round" />
          </svg>
          <span className="flex-1 text-left opacity-40 group-hover:opacity-70 transition-opacity text-[11.5px]">Search</span>
          <kbd className="text-[10px] font-mono opacity-30">⌘K</kbd>
        </button>
      </div>

      {/* ── Ask AI ─────────────────────────────────────────────────── */}
      {currentWorkspaceId && (
        <div className="px-3 pb-2">
          <Link
            href={`/workspace/${currentWorkspaceId}/ask`}
            className="flex items-center gap-2 h-8 w-full px-2.5 text-[12px] rounded-lg transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--sidebar-ring)]"
            style={{
              color: 'var(--spark)',
              fontWeight: pathname?.endsWith('/ask') ? 600 : 500,
              opacity: pathname?.endsWith('/ask') ? 1 : 0.72,
              background: pathname?.endsWith('/ask') ? 'oklch(0.44 0.13 152 / 12%)' : 'transparent',
            }}
          >
            {/* Spark / AI icon — always sage */}
            <svg width="12" height="12" viewBox="0 0 11 11" fill="currentColor" className="shrink-0" aria-hidden>
              <path d="M5.5 1 6.7 4.3 10 5.5 6.7 6.7 5.5 10 4.3 6.7 1 5.5 4.3 4.3z" />
            </svg>
            <span>Ask AI</span>
          </Link>
        </div>
      )}

      {/* ── Nav content ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 sidebar-scroll" aria-label="Main navigation">

        {/* Workspace switcher */}
        <p className="px-2 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.10em] uppercase"
          style={{ color: 'var(--sidebar-foreground)', opacity: 0.35 }}>
          Workspace
        </p>
        {workspaces.map(({ workspaces: ws }) =>
          ws ? (
            <SidebarNavItem
              key={ws.id}
              href={`/workspace/${ws.id}`}
              active={currentWorkspaceId === ws.id && !isSettings}
              icon={
                <span
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-[9px] font-bold"
                  style={{
                    background: currentWorkspaceId === ws.id
                      ? 'var(--sidebar-primary)'
                      : 'oklch(0 0 0 / 12%)',
                    color: currentWorkspaceId === ws.id
                      ? 'var(--sidebar-primary-foreground)'
                      : 'var(--sidebar-foreground)',
                  }}
                >
                  {ws.name[0].toUpperCase()}
                </span>
              }
              label={ws.name}
            />
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

        {currentWorkspaceId && (
          <button
            onClick={() => handleCreatePage(null)}
            className="mt-1 flex w-full items-center gap-2 h-8 rounded-lg px-2.5 text-[12px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--sidebar-ring)] hover:bg-sidebar-accent"
            style={{ color: 'var(--sidebar-foreground)', opacity: 0.38 }}
          >
            <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
              <path d="M6.5 1.5v10M1.5 6.5h10" />
            </svg>
            New page
          </button>
        )}
      </nav>

      {/* ── User footer ────────────────────────────────────────────── */}
      <div
        className="px-3 py-2.5 shrink-0"
        style={{ borderTop: '1px solid var(--sidebar-border)' }}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--sidebar-ring)] hover:bg-sidebar-accent"
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold"
              style={{
                background: 'var(--sidebar-primary)',
                color: 'var(--sidebar-primary-foreground)',
              }}
            >
              {userInitial}
            </span>
            <p
              className="truncate text-[11px] font-mono flex-1 text-left tracking-tight"
              style={{ color: 'var(--sidebar-foreground)', opacity: 0.50 }}
            >
              {user.email}
            </p>
            {/* Three-dot menu icon */}
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none"
              style={{ color: 'var(--sidebar-foreground)', opacity: 0.28, flexShrink: 0 }} aria-hidden>
              <circle cx="6.5" cy="3" r="1" fill="currentColor" />
              <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
              <circle cx="6.5" cy="10" r="1" fill="currentColor" />
            </svg>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-[9]" aria-hidden onClick={() => setUserMenuOpen(false)} />
              <div
                className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl z-10 py-1 overflow-hidden animate-fade-in"
                style={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 24px oklch(0 0 0 / 0.14), 0 2px 6px oklch(0 0 0 / 0.08)',
                }}
              >
                {currentWorkspaceId && (
                  <Link
                    href={`/workspace/${currentWorkspaceId}/settings`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground"
                    style={{ color: 'var(--foreground)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                      <circle cx="7" cy="7" r="2.2" />
                      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" strokeLinecap="round" />
                    </svg>
                    Settings &amp; members
                  </Link>
                )}
                {currentWorkspaceId && (
                  <div style={{ height: '1px', background: 'var(--border)', margin: '2px 8px' }} />
                )}
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
                  className="w-full cursor-pointer text-left px-3 py-2 text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground"
                  style={{ color: 'var(--foreground)' }}
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

function SidebarNavItem({
  href,
  active,
  icon,
  label,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      href={href}
      className="relative flex items-center gap-2 h-8 rounded-lg px-2.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--sidebar-ring)] font-medium hover:bg-sidebar-accent"
      style={{
        color: 'var(--sidebar-foreground)',
        opacity: active ? 1 : 0.58,
        background: active ? 'oklch(0 0 0 / 6%)' : 'transparent',
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
          style={{ width: '2px', height: '16px', background: 'var(--sidebar-primary)' }}
          aria-hidden
        />
      )}
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  )
}
