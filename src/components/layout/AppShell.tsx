'use client'

import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page, Database } from '@/lib/types/database'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  databases: Database[]
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, databases, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaces={workspaces} user={user} pages={pages} databases={databases} />
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  )
}
