'use client'

import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page } from '@/lib/types/database'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
  children: React.ReactNode
}

export function AppShell({ workspaces, user, pages, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaces={workspaces} user={user} pages={pages} />
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  )
}
