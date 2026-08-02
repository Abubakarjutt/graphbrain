import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SignupPage from '@/app/(auth)/signup/page'

vi.mock('@/components/auth/SignupForm', () => ({
  SignupForm: () => <div data-testid="signup-form-stub" />,
}))
vi.mock('@/components/auth/ConstellationField', () => ({
  ConstellationField: () => <div data-testid="constellation-stub" />,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

describe('SignupPage', () => {
  it('renders the create-account heading, eyebrow, and subtitle', () => {
    render(<SignupPage />)
    expect(screen.getByText('Create your account')).toBeInTheDocument()
    expect(screen.getByText('Get started')).toBeInTheDocument()
    expect(screen.getByText('Your second brain is one step away.')).toBeInTheDocument()
  })

  it('renders the signup form', () => {
    render(<SignupPage />)
    expect(screen.getByTestId('signup-form-stub')).toBeInTheDocument()
  })

  it('links to the login page', () => {
    render(<SignupPage />)
    const link = screen.getByText('Sign in').closest('a')
    expect(link).toHaveAttribute('href', '/login')
  })
})
