'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FIELD_LABEL, FIELD_INPUT, PRIMARY_BTN, GHOST_BTN } from './field-styles'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = '/'
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email first')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setMagicLinkSent(true)
    setLoading(false)
  }

  if (magicLinkSent) {
    return (
      <div className="rounded-xl border border-[var(--gold)]/25 bg-[var(--gold)]/10 px-4 py-5 text-center">
        <p className="text-sm text-white/80">
          Magic link sent to{' '}
          <span className="font-medium text-[var(--gold)]">{email}</span>.
        </p>
        <p className="mt-1 text-xs text-white/40">Check your inbox to continue.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email" className={FIELD_LABEL}>
          Email
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className={FIELD_INPUT}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className={FIELD_LABEL}>
          Password
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className={FIELD_INPUT}
        />
      </div>
      {error && (
        <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" className={PRIMARY_BTN} disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={GHOST_BTN}
        onClick={handleMagicLink}
        disabled={loading}
      >
        Email me a magic link
      </Button>
    </form>
  )
}
