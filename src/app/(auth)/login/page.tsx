import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'
import { AuthShell } from '@/components/auth/AuthShell'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in"
      subtitle="Return to your knowledge graph."
      footer={
        <>
          New here?{' '}
          <Link
            href="/signup"
            className="text-white/80 underline decoration-indigo-400/60 underline-offset-4 transition-colors hover:text-white"
          >
            Create an account
          </Link>
        </>
      }
    >
      {params.message && (
        <p className="mb-4 rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-3 py-2 text-sm text-indigo-300">
          {params.message}
        </p>
      )}
      {params.error && (
        <p className="mb-4 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {params.error}
        </p>
      )}
      <LoginForm />
    </AuthShell>
  )
}
