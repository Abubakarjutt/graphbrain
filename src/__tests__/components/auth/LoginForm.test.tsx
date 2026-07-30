import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from '@/components/auth/LoginForm'

const mockSignInWithPassword = vi.fn()
const mockSignInWithOtp = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOtp: mockSignInWithOtp,
    },
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and password fields', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('calls signInWithPassword with email and password on submit', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'password123',
      })
    })
  })

  it('shows error message on failed login', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid credentials' } })
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('sends magic link when magic link button clicked with valid email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@test.com' })
      )
      expect(screen.getByText(/magic link sent/i)).toBeInTheDocument()
    })
  })

  it('shows error if magic link clicked without email', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

    await waitFor(() => {
      expect(screen.getByText(/enter your email/i)).toBeInTheDocument()
    })
    expect(mockSignInWithOtp).not.toHaveBeenCalled()
  })
})
