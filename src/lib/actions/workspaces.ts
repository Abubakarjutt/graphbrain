'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createWorkspace(name: string): Promise<{ id: string; name: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: workspace, error } = await supabase
    .from('workspaces')
    .insert({ name: name.trim(), owner_id: user.id })
    .select('id, name')
    .single()
  if (error || !workspace) throw new Error(error?.message ?? 'Failed to create workspace')

  await supabase
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

  revalidatePath('/', 'layout')
  return workspace
}

export async function sendInvite(
  workspaceId: string,
  email: string,
  role: 'editor' | 'viewer' = 'editor'
): Promise<{ token: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data, error } = await supabase
    .from('workspace_invites')
    .insert({ workspace_id: workspaceId, invited_email: email.toLowerCase().trim(), invited_by: user.id, role })
    .select('token')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error(`${email} has already been invited.`)
    throw new Error(error.message)
  }
  return { token: data.token }
}

export async function acceptInvite(token: string): Promise<{ workspaceId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to accept an invite.')

  // Use admin client — invite rows are RLS-restricted to the workspace owner;
  // the invitee needs the admin client to look up and accept their own token.
  const admin = createAdminClient()
  const { data: invite, error } = await admin
    .from('workspace_invites')
    .select('id, workspace_id, role, accepted_at')
    .eq('token', token)
    .single()

  if (error || !invite) throw new Error('Invite not found. It may have expired or been revoked.')
  if (invite.accepted_at) throw new Error('This invite has already been used.')

  // Check not already a member
  const { data: existing } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', invite.workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    // members_insert allows user_id = auth.uid(), so regular client works here
    const { error: memberErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: invite.workspace_id, user_id: user.id, role: invite.role })
    if (memberErr) throw new Error(memberErr.message)
  }

  await admin
    .from('workspace_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token)

  revalidatePath('/', 'layout')
  return { workspaceId: invite.workspace_id }
}

export interface WorkspaceInvite {
  id: string
  invited_email: string
  role: string
  token: string
  accepted_at: string | null
  created_at: string
}

export interface WorkspaceMember {
  user_id: string
  role: string
  email: string
}

export async function getWorkspaceDetails(workspaceId: string): Promise<{
  workspace: { id: string; name: string; owner_id: string }
  members: WorkspaceMember[]
  invites: WorkspaceInvite[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, owner_id')
    .eq('id', workspaceId)
    .single()
  if (!workspace) throw new Error('Workspace not found')

  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)

  const memberIds = (memberRows ?? []).map(m => m.user_id)
  let members: WorkspaceMember[] = []
  if (memberIds.length > 0) {
    const admin = createAdminClient()
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const byId = new Map(authUsers.map(u => [u.id, u.email ?? '']))
    members = (memberRows ?? []).map(m => ({ user_id: m.user_id, role: m.role, email: byId.get(m.user_id) ?? '' }))
  }

  const { data: invites } = await supabase
    .from('workspace_invites')
    .select('id, invited_email, role, token, accepted_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  return { workspace, members, invites: (invites ?? []) as WorkspaceInvite[] }
}

export async function revokeInvite(inviteId: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('workspace_invites').delete().eq('id', inviteId).eq('workspace_id', workspaceId)
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  if (userId === user.id) throw new Error('You cannot remove yourself.')
  await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  revalidatePath('/', 'layout')
}
