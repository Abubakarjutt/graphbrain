'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

interface WorkspaceEntry {
  workspace_id: string
  role: string
  workspaces: { id: string; name: string } | null
}

interface SidebarProps {
  workspaces: WorkspaceEntry[]
  user: User
}

export function Sidebar({ workspaces, user }: SidebarProps) {
  const params = useParams()
  const currentWorkspaceId = params?.workspaceId as string | undefined

  return (
    <aside className="w-64 flex-shrink-0 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-4 border-b">
        <span className="font-semibold text-sm tracking-tight">graphbrain</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {workspaces.map(({ workspaces: ws }) =>
          ws ? (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                currentWorkspaceId === ws.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              {ws.name}
            </Link>
          ) : null
        )}
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
    </aside>
  )
}
