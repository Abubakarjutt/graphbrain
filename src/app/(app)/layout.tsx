import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import type { WorkspaceEntry, Page } from '@/lib/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id) as { data: WorkspaceEntry[] | null }

  // Fetch pages for all of the user's workspaces so the sidebar stays
  // correct when navigating between workspaces. Sidebar filters by active workspace.
  const workspaceIds = (workspaces ?? []).map(w => w.workspace_id)
  const pages: Page[] = workspaceIds.length > 0
    ? (await supabase
        .from('pages')
        .select('*')
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: true })
      ).data ?? []
    : []

  return (
    <AppShell workspaces={workspaces ?? []} user={user} pages={pages}>
      {children}
    </AppShell>
  )
}
