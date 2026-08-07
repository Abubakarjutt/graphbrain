'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createWorkspace, sendInvite } from '@/lib/actions/workspaces'
import { FIELD_LABEL, FIELD_INPUT, PRIMARY_BTN } from './field-styles'

// ─── Step indicators ──────────────────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Account', 'Organization', 'Invite']
  return (
    <div className="flex items-center gap-0 mb-7">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
                style={{
                  background: done ? 'oklch(0.50 0.13 58)' : active ? 'oklch(0.52 0.22 240 / 20%)' : 'oklch(1 0 0 / 8%)',
                  color: done || active ? 'oklch(0.99 0 0)' : 'oklch(1 0 0 / 30%)',
                  border: active ? '1.5px solid oklch(0.50 0.13 58)' : 'none',
                }}
              >
                {done ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : n}
              </span>
              <span className="text-[11px] font-medium hidden sm:block"
                style={{ color: active ? 'oklch(0.9 0 0)' : 'oklch(1 0 0 / 35%)' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2 h-px" style={{ background: done ? 'oklch(0.52 0.22 240 / 50%)' : 'oklch(1 0 0 / 10%)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function SignupForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const supabase = useMemo(() => createClient(), [])

  // Step 1
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Step 2
  const [orgName, setOrgName] = useState('')

  // Step 3
  const [inviteEmails, setInviteEmails] = useState<string[]>([''])
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviteLinks, setInviteLinks] = useState<{ email: string; url: string }[]>([])

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // ── Step 1: create auth account ──────────────────────────────────────────

  async function handleAccount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep(2)
  }

  // ── Step 2: create workspace ─────────────────────────────────────────────

  async function handleOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!orgName.trim()) { setError('Please enter an organization name.'); return }
    setLoading(true)
    setError(null)
    try {
      await createWorkspace(orgName.trim())
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: send invites then enter app ──────────────────────────────────

  async function handleInvites(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Refetch workspace to get the ID that was just created
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Session expired — please sign in again.')

      const { data: memberRows } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (!memberRows) throw new Error('Could not find your workspace.')
      const workspaceId = memberRows.workspace_id

      const validEmails = inviteEmails.map(e => e.trim().toLowerCase()).filter(e => e && e !== email.toLowerCase())
      const links: { email: string; url: string }[] = []

      for (const invEmail of validEmails) {
        try {
          const { token } = await sendInvite(workspaceId, invEmail, inviteRole)
          links.push({ email: invEmail, url: `${window.location.origin}/invite/${token}` })
        } catch {
          // Skip duplicates / errors silently — show whatever succeeded
        }
      }

      if (links.length > 0) {
        setInviteLinks(links)
        setLoading(false)
        return // Stay on step 3 to show the links
      }

      // No invites or all failed — go to app
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  // ── Invite email management ──────────────────────────────────────────────

  function addInviteRow() { setInviteEmails(prev => [...prev, '']) }
  function updateInviteEmail(i: number, val: string) {
    setInviteEmails(prev => prev.map((e, idx) => idx === i ? val : e))
  }
  function removeInviteEmail(i: number) {
    setInviteEmails(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [''])
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <Steps current={step} />

      {/* ── Step 1: Account ──────────────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleAccount} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className={FIELD_LABEL}>Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="you@company.com" className={FIELD_INPUT} />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className={FIELD_LABEL}>Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} placeholder="At least 8 characters" className={FIELD_INPUT} />
          </div>
          {error && <ErrorBox message={error} />}
          <button type="submit" className={PRIMARY_BTN} disabled={loading}>
            {loading ? 'Creating account…' : 'Continue →'}
          </button>
        </form>
      )}

      {/* ── Step 2: Organization ─────────────────────────────────────────── */}
      {step === 2 && (
        <form onSubmit={handleOrg} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="orgname" className={FIELD_LABEL}>Organization name</label>
            <input id="orgname" type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
              required autoFocus placeholder="Acme Inc." className={FIELD_INPUT} />
            <p className="text-[11px]" style={{ color: 'oklch(1 0 0 / 30%)' }}>
              This is your team's workspace. You can rename it later.
            </p>
          </div>
          {error && <ErrorBox message={error} />}
          <button type="submit" className={PRIMARY_BTN} disabled={loading}>
            {loading ? 'Creating organization…' : 'Create organization →'}
          </button>
        </form>
      )}

      {/* ── Step 3: Invite teammates ─────────────────────────────────────── */}
      {step === 3 && (
        <form onSubmit={handleInvites} className="space-y-5">
          {inviteLinks.length > 0 ? (
            // Show generated invite links
            <div className="space-y-3">
              <p className="text-[13px]" style={{ color: 'oklch(0.85 0 0)' }}>
                Share these links with your teammates:
              </p>
              <div className="space-y-2">
                {inviteLinks.map(({ email, url }) => (
                  <div key={email} className="rounded-lg p-3 space-y-1.5"
                    style={{ background: 'oklch(1 0 0 / 5%)', border: '1px solid oklch(1 0 0 / 10%)' }}>
                    <p className="text-[11px] font-medium" style={{ color: 'oklch(0.75 0 0)' }}>{email}</p>
                    <div className="flex items-center gap-2">
                      <input readOnly value={url}
                        className="flex-1 text-[11px] bg-transparent outline-none truncate font-mono"
                        style={{ color: 'oklch(0.65 0.14 240)' }}
                        onFocus={e => e.target.select()} />
                      <button type="button"
                        onClick={() => navigator.clipboard.writeText(url)}
                        className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded cursor-pointer transition-colors"
                        style={{ background: 'oklch(0.52 0.22 240 / 25%)', color: 'oklch(0.75 0.14 62)' }}>
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { window.location.href = '/' }}
                className={PRIMARY_BTN}>
                Enter workspace →
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={FIELD_LABEL}>Invite teammates</span>
                  <span className="text-[10px]" style={{ color: 'oklch(1 0 0 / 30%)' }}>Optional</span>
                </div>
                <div className="space-y-2">
                  {inviteEmails.map((invEmail, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="email"
                        value={invEmail}
                        onChange={e => updateInviteEmail(i, e.target.value)}
                        placeholder="teammate@company.com"
                        className={`${FIELD_INPUT} flex-1`}
                      />
                      <button type="button" onClick={() => removeInviteEmail(i)}
                        className="h-11 w-11 grid place-items-center rounded-lg cursor-pointer transition-colors shrink-0"
                        style={{ background: 'oklch(1 0 0 / 6%)', color: 'oklch(1 0 0 / 40%)' }}
                        aria-label="Remove">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                          <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addInviteRow}
                  className="flex items-center gap-1.5 text-[12px] cursor-pointer transition-colors"
                  style={{ color: 'oklch(0.65 0.14 240)' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                    <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Add another
                </button>
              </div>

              <div className="space-y-1.5">
                <label className={FIELD_LABEL}>Role</label>
                <div className="flex gap-2">
                  {(['editor', 'viewer'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setInviteRole(r)}
                      className="flex-1 h-9 rounded-lg text-[12px] font-medium cursor-pointer transition-colors capitalize"
                      style={{
                        background: inviteRole === r ? 'oklch(0.52 0.22 240 / 25%)' : 'oklch(1 0 0 / 6%)',
                        color: inviteRole === r ? 'oklch(0.75 0.14 62)' : 'oklch(1 0 0 / 45%)',
                        border: inviteRole === r ? '1.5px solid oklch(0.52 0.22 240 / 40%)' : '1.5px solid transparent',
                      }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {error && <ErrorBox message={error} />}

              <div className="flex flex-col gap-2">
                <button type="submit" className={PRIMARY_BTN} disabled={loading}>
                  {loading ? 'Sending invites…' : 'Send invites & enter workspace'}
                </button>
                <button type="button" onClick={() => { window.location.href = '/' }}
                  className="h-10 w-full rounded-lg text-[13px] cursor-pointer transition-colors"
                  style={{ color: 'oklch(1 0 0 / 35%)' }}>
                  Skip for now
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </p>
  )
}
