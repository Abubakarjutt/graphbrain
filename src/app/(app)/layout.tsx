import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { getPages } from '@/lib/actions/pages'
import type { WorkspaceEntry } from '@/lib/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id) as { data: WorkspaceEntry[] | null }

  const firstWorkspaceId = workspaces?.[0]?.workspace_id
  const pages = firstWorkspaceId ? await getPages(firstWorkspaceId) : []

  return (
    <AppShell workspaces={workspaces ?? []} user={user} pages={pages}>
      {children}
    </AppShell>
  )
}
