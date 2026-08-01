import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (membership) redirect(`/workspace/${membership.workspace_id}`)

  // No workspace yet — create one automatically so the user isn't stuck in a redirect loop
  const workspaceName = user.email
    ? `${user.email.split('@')[0]}'s Workspace`
    : 'My Workspace'

  const { data: workspace } = await supabase
    .from('workspaces')
    .insert({ name: workspaceName, owner_id: user.id })
    .select()
    .single()

  if (workspace) {
    await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })
    redirect(`/workspace/${workspace.id}`)
  }

  redirect('/login')
}
