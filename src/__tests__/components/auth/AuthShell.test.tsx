import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthShell } from '@/components/auth/AuthShell'

// ConstellationField drives a canvas animation via window.matchMedia, which
// jsdom doesn't implement — stubbed out since its own behavior isn't
// AuthShell's responsibility to verify (and would crash the test otherwise).
vi.mock('@/components/auth/ConstellationField', () => ({
  ConstellationField: () => <div data-testid="constellation-stub" />,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

function renderShell(overrides: Partial<React.ComponentProps<typeof AuthShell>> = {}) {
  return render(
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in"
      subtitle="Return to your knowledge graph."
      footer={<span>Need an account? Sign up</span>}
      {...overrides}
    >
      <div>form goes here</div>
    </AuthShell>
  )
}

describe('AuthShell', () => {
  it('renders the eyebrow, title, and subtitle', () => {
    renderShell()
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
    expect(screen.getByText('Return to your knowledge graph.')).toBeInTheDocument()
  })

  it('renders the children inside the auth card', () => {
    renderShell()
    expect(screen.getByText('form goes here')).toBeInTheDocument()
  })

  it('renders the footer content', () => {
    renderShell()
    expect(screen.getByText('Need an account? Sign up')).toBeInTheDocument()
  })

  it('renders the graphbrain brand mark linking to the homepage', () => {
    renderShell()
    const link = screen.getByText('graphbrain').closest('a')
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders all three product principles', () => {
    renderShell()
    expect(screen.getByText(/Capture anything/)).toBeInTheDocument()
    expect(screen.getByText(/Every idea links to every other/)).toBeInTheDocument()
    expect(screen.getByText(/Ask questions/)).toBeInTheDocument()
  })

  it('renders the current year in the footer copyright line', () => {
    renderShell()
    const year = new Date().getFullYear().toString()
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument()
  })

  it('updates when a different eyebrow/title/subtitle are passed (e.g. signup)', () => {
    renderShell({ eyebrow: 'Get started', title: 'Create your account', subtitle: 'Your second brain is one step away.' })
    expect(screen.getByText('Get started')).toBeInTheDocument()
    expect(screen.getByText('Create your account')).toBeInTheDocument()
    expect(screen.getByText('Your second brain is one step away.')).toBeInTheDocument()
  })
})
