'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'
import { Sidebar } from './Sidebar'
import { OllamaStatusBanner } from './OllamaStatusBanner'
import { CmdKModal } from '@/components/query/CmdKModal'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
  ollamaAvailable?: boolean
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, databases, ollamaAvailable = true, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden flex-col">
      <OllamaStatusBanner ollamaAvailable={ollamaAvailable} />

      {/* Mobile top bar */}
      <div
        className="flex items-center gap-3 px-4 h-12 shrink-0 border-b lg:hidden"
        style={{ background: 'var(--sidebar)', borderColor: 'var(--sidebar-border)' }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="h-8 w-8 grid place-items-center rounded-md transition-colors"
          style={{ color: 'var(--sidebar-foreground)' }}
          aria-label="Open sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <span className="font-display text-sm font-semibold tracking-tight" style={{ color: 'var(--sidebar-foreground)' }}>
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
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>

      <CmdKModal databases={databases} pages={pages} />
    </div>
  )
}
