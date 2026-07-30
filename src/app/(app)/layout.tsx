import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  type WorkspaceMemberRow = {
    workspace_id: string
    role: string
    workspaces: { id: string; name: string } | null
  }
  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id) as { data: WorkspaceMemberRow[] | null }

  return (
    <AppShell workspaces={workspaces ?? []} user={user}>
      {children}
    </AppShell>
  )
}
