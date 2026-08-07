'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { acceptInvite } from '@/lib/actions/workspaces'
import { FIELD_LABEL, FIELD_INPUT, PRIMARY_BTN } from '@/components/auth/field-styles'

interface Props {
  token: string
  invitedEmail: string
  workspaceName: string
  isLoggedIn: boolean
  currentUserEmail: string | null
}

export function AcceptInviteClient({ token, invitedEmail, workspaceName, isLoggedIn, currentUserEmail }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState(invitedEmail)
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setLoading(true)
    setError(null)
    try {
      const { workspaceId } = await acceptInvite(token)
      window.location.href = `/workspace/${workspaceId}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite')
      setLoading(false)
    }
  }

  async function handleAuthAndAccept(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message)
      }
      await handleAccept()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  // Already logged in — just show the accept button
  if (isLoggedIn) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg p-4" style={{ background: 'oklch(1 0 0 / 5%)', border: '1px solid oklch(1 0 0 / 10%)' }}>
          <p className="text-[13px]" style={{ color: 'oklch(0.75 0 0)' }}>
            Signed in as <span className="font-semibold text-white">{currentUserEmail}</span>
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'oklch(0.55 0 0)' }}>
            You'll be added to <span className="font-medium" style={{ color: 'oklch(0.75 0 0)' }}>{workspaceName}</span>
          </p>
        </div>
        {error && <ErrorBox message={error} />}
        <button onClick={handleAccept} disabled={loading} className={PRIMARY_BTN}>
          {loading ? 'Joining…' : `Join ${workspaceName}`}
        </button>
      </div>
    )
  }

  // Not logged in — auth form
  return (
    <form onSubmit={handleAuthAndAccept} className="space-y-5">
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'oklch(1 0 0 / 6%)' }}>
        {(['signup', 'login'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className="flex-1 h-8 rounded-md text-[12px] font-medium cursor-pointer transition-colors capitalize"
            style={{
              background: mode === m ? 'oklch(0.52 0.22 240)' : 'transparent',
              color: mode === m ? 'white' : 'oklch(1 0 0 / 40%)',
            }}>
            {m === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label htmlFor="inv-email" className={FIELD_LABEL}>Email</label>
        <input id="inv-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
          required placeholder="you@company.com" className={FIELD_INPUT} />
      </div>
      <div className="space-y-2">
        <label htmlFor="inv-password" className={FIELD_LABEL}>Password</label>
        <input id="inv-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
          required minLength={8} placeholder="At least 8 characters" className={FIELD_INPUT} />
      </div>

      {error && <ErrorBox message={error} />}

      <button type="submit" className={PRIMARY_BTN} disabled={loading}>
        {loading ? 'Joining…' : `${mode === 'signup' ? 'Create account & join' : 'Sign in & join'} ${workspaceName}`}
      </button>
    </form>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </p>
  )
}
