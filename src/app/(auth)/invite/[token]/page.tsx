import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/auth/AuthShell'
import { AcceptInviteClient } from './AcceptInviteClient'
import Link from 'next/link'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()

  const { data: invite } = await supabase
    .rpc('get_invite_by_token', { p_token: token })
    .maybeSingle()

  const { data: { user } } = await supabase.auth.getUser()

  const workspaceName = invite?.workspace_name ?? null

  return (
    <AuthShell
      title={invite ? `Join ${workspaceName}` : 'Invalid invite'}
      subtitle={
        invite
          ? invite.accepted_at
            ? 'This invite has already been used.'
            : `You've been invited as ${invite.role}.`
          : 'This invite link is invalid or has been revoked.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-white/80 underline decoration-indigo-400/60 underline-offset-4 hover:text-white transition-colors">
            Sign in
          </Link>
        </>
      }
    >
      {invite && !invite.accepted_at ? (
        <AcceptInviteClient
          token={token}
          invitedEmail={invite.invited_email}
          workspaceName={workspaceName ?? ''}
          isLoggedIn={!!user}
          currentUserEmail={user?.email ?? null}
        />
      ) : (
        <Link href="/"
          className="flex items-center justify-center h-11 w-full rounded-lg text-[0.875rem] font-semibold text-white transition-all"
          style={{ background: 'oklch(0.50 0.13 58)', boxShadow: '0 4px 16px -4px oklch(0.52 0.22 240 / 0.45)' }}>
          Go to app
        </Link>
      )}
    </AuthShell>
  )
}
