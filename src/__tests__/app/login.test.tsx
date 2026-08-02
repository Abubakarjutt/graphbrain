import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage from '@/app/(auth)/login/page'

// AuthShell renders for real (its own suite covers it in isolation) so this
// file verifies the actual page->AuthShell wiring end to end. LoginForm has
// its own suite and ConstellationField needs browser APIs jsdom lacks, so
// both are stubbed.
vi.mock('@/components/auth/LoginForm', () => ({
  LoginForm: () => <div data-testid="login-form-stub" />,
}))
vi.mock('@/components/auth/ConstellationField', () => ({
  ConstellationField: () => <div data-testid="constellation-stub" />,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

async function renderPage(searchParams: { message?: string; error?: string } = {}) {
  const element = await LoginPage({ searchParams: Promise.resolve(searchParams) })
  return render(element)
}

describe('LoginPage', () => {
  it('renders the sign-in heading, eyebrow, and subtitle', async () => {
    await renderPage()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByText('Return to your knowledge graph.')).toBeInTheDocument()
  })

  it('renders the login form', async () => {
    await renderPage()
    expect(screen.getByTestId('login-form-stub')).toBeInTheDocument()
  })

  it('links to the signup page', async () => {
    await renderPage()
    const link = screen.getByText('Create an account').closest('a')
    expect(link).toHaveAttribute('href', '/signup')
  })

  it('shows no banners when there is no message or error', async () => {
    const { container } = await renderPage()
    // Both the message and error banners share this exact class pairing and
    // nothing else in the tree does, so an empty match means neither rendered.
    expect(container.querySelectorAll('.rounded-lg.border')).toHaveLength(0)
  })

  it('shows the message banner when a message search param is present', async () => {
    await renderPage({ message: 'Check your email to confirm your account' })
    expect(screen.getByText('Check your email to confirm your account')).toBeInTheDocument()
  })

  it('shows the error banner when an error search param is present', async () => {
    await renderPage({ error: 'Invalid login credentials' })
    expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
  })

  it('can show both a message and an error at the same time', async () => {
    await renderPage({ message: 'Session expired', error: 'Please sign in again' })
    expect(screen.getByText('Session expired')).toBeInTheDocument()
    expect(screen.getByText('Please sign in again')).toBeInTheDocument()
  })
})
