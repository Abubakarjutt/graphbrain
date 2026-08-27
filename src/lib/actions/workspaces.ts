'use server'

import { createClient } from '@/lib/supabase/server'
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

  const { data: workspaceId, error } = await supabase.rpc('accept_workspace_invite', { p_token: token })

  if (error) {
    if (error.message === 'invalid_invite') throw new Error('Invite not found. It may have expired or been revoked.')
    if (error.message === 'invite_email_mismatch') throw new Error('This invite was sent to a different email address.')
    throw new Error(error.message)
  }

  revalidatePath('/', 'layout')
  return { workspaceId: workspaceId as string }
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

  const { data: emailRowsData } = await supabase.rpc('get_workspace_member_emails', { p_workspace_id: workspaceId })
  const emailRows = (emailRowsData ?? []) as { user_id: string; email: string }[]
  const emailById = new Map(emailRows.map((r: { user_id: string; email: string }) => [r.user_id, r.email]))
  const members: WorkspaceMember[] = (memberRows ?? []).map(m => ({
    user_id: m.user_id,
    role: m.role,
    email: emailById.get(m.user_id) ?? '',
  }))

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
