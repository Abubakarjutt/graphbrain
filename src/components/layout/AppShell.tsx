'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database, DatabaseRowLink } from '@/lib/types/database'
import { Sidebar } from './Sidebar'
import { OllamaStatusBanner } from './OllamaStatusBanner'
import { CmdKModal } from '@/components/query/CmdKModal'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
  databaseRows: DatabaseRowLink[]
  ollamaAvailable?: boolean
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, databases, databaseRows, ollamaAvailable = true, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden flex-col">
      <OllamaStatusBanner ollamaAvailable={ollamaAvailable} />

      {/* Mobile top bar */}
      <div className="flex items-center gap-3 px-4 h-12 shrink-0 border-b border-sidebar-border bg-sidebar lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="h-8 w-8 grid place-items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Open sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <span className="font-display text-[15px] font-medium tracking-tight text-sidebar-foreground">
          graphbrain
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        <Sidebar
          workspaces={workspaces}
          user={user}
          pages={pages}
          databases={databases}
          databaseRows={databaseRows}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          onSearchOpen={() => setSearchOpen(true)}
        />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>

      <CmdKModal databases={databases} pages={pages} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
