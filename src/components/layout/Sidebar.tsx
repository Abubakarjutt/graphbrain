'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { User } from '@supabase/supabase-js'
import type { WorkspaceEntry, Page } from '@/lib/types/database'
import { createPage } from '@/lib/actions/pages'
import { SidebarPageTree } from './SidebarPageTree'

interface SidebarProps {
  workspaces: WorkspaceEntry[]
  user: User
  pages: Page[]
}

export function Sidebar({ workspaces, user, pages }: SidebarProps) {
  const params = useParams()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const currentWorkspaceId = params?.workspaceId as string | undefined

  function handleCreatePage(parentId: string | null) {
    if (!currentWorkspaceId) return
    startTransition(async () => {
      const page = await createPage(currentWorkspaceId, parentId)
      router.push(`/workspace/${currentWorkspaceId}/page/${page.id}`)
    })
  }

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
        {currentWorkspaceId && (
          <SidebarPageTree
            pages={pages.filter(p => p.workspace_id === currentWorkspaceId)}
            workspaceId={currentWorkspaceId}
            onCreatePage={handleCreatePage}
          />
        )}
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
    </aside>
  )
}
