import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">graphbrain</h1>
          <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
        </div>
        {params.message && (
          <p className="text-sm text-center text-muted-foreground">{params.message}</p>
        )}
        {params.error && (
          <p className="text-sm text-center text-destructive">{params.error}</p>
        )}
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
