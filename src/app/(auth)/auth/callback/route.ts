import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !user) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)

  if (!memberships || memberships.length === 0) {
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
    }
  }

  return NextResponse.redirect(new URL(next, origin))
}
