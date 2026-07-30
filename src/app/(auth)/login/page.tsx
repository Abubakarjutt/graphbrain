import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string; error?: string }
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">graphbrain</h1>
          <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
        </div>
        {searchParams.message && (
          <p className="text-sm text-center text-muted-foreground">{searchParams.message}</p>
        )}
        {searchParams.error && (
          <p className="text-sm text-center text-destructive">{searchParams.error}</p>
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
