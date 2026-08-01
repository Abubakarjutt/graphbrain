import Link from 'next/link'
import { SignupForm } from '@/components/auth/SignupForm'
import { AuthShell } from '@/components/auth/AuthShell'

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="Your second brain is one step away."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-white/80 underline decoration-[var(--gold)]/60 underline-offset-4 transition-colors hover:text-white"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  )
}
