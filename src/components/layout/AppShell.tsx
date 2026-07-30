'use client'

import type { User } from '@supabase/supabase-js'
import { Sidebar } from './Sidebar'

interface WorkspaceEntry {
  workspace_id: string
  role: string
  workspaces: { id: string; name: string } | null
}

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  children: React.ReactNode
}

export function AppShell({ workspaces, user, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaces={workspaces} user={user} />
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  )
}
