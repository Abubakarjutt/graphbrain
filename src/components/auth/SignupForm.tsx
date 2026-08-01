'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { FIELD_LABEL, FIELD_INPUT, PRIMARY_BTN } from './field-styles'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      // Email confirmations disabled locally — session is issued immediately
      window.location.href = '/'
    } else {
      // Email confirmation required — tell user to check their inbox
      router.push('/login?message=Check your email to confirm your account')
    }
  }

  return (
    <form onSubmit={handleSignup} className="space-y-5">
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
          minLength={8}
          placeholder="At least 8 characters"
          className={FIELD_INPUT}
        />
      </div>
      {error && (
        <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" className={PRIMARY_BTN} disabled={loading}>
        {loading ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
