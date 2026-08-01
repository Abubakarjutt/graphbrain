'use client'

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
  return (
    <div className="flex h-screen overflow-hidden flex-col">
      <OllamaStatusBanner ollamaAvailable={ollamaAvailable} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar workspaces={workspaces} user={user} pages={pages} databases={databases} />
        <main className="flex-1 overflow-auto bg-muted/40">{children}</main>
      </div>
      <CmdKModal databases={databases} />
    </div>
  )
}
