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

  describe('rendering', () => {
    it('renders email and password fields', () => {
      render(<LoginForm />)
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
    })

    it('renders Sign in and Send magic link buttons', () => {
      render(<LoginForm />)
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /magic link/i })).toBeInTheDocument()
    })

    it('does not show error on initial render', () => {
      render(<LoginForm />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('password sign-in', () => {
    it('calls signInWithPassword with entered email and password', async () => {
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

    it('navigates to / via full page load on successful login', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null })
      // jsdom doesn't implement navigation; stub window.location.href setter
      const hrefSpy = vi.spyOn(window, 'location', 'get').mockReturnValue(
        { ...window.location, href: '' } as Location
      )
      const assign = vi.fn()
      Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })

      render(<LoginForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect((window.location as { href: string }).href).toBe('/')
      })
      hrefSpy.mockRestore()
    })

    it('does not navigate on failed login', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid credentials' } })
      const originalHref = window.location.href
      render(<LoginForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())
      expect(window.location.href).toBe(originalHref)
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

    it('clears previous error when a new sign-in is attempted', async () => {
      mockSignInWithPassword
        .mockResolvedValueOnce({ error: { message: 'Invalid credentials' } })
        .mockResolvedValueOnce({ error: null })

      render(<LoginForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
      })
    })

    it('shows loading text while signing in', async () => {
      let resolveSignIn!: (v: { error: null }) => void
      mockSignInWithPassword.mockReturnValue(new Promise(r => { resolveSignIn = r }))

      render(<LoginForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByRole('button', { name: /signing in/i })).toBeInTheDocument()
      resolveSignIn({ error: null })
    })

    it('disables both buttons while signing in', async () => {
      let resolveSignIn!: (v: { error: null }) => void
      mockSignInWithPassword.mockReturnValue(new Promise(r => { resolveSignIn = r }))

      render(<LoginForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await screen.findByRole('button', { name: /signing in/i })
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /magic link/i })).toBeDisabled()
      resolveSignIn({ error: null })
    })
  })

  describe('magic link', () => {
    it('calls signInWithOtp with email and shows confirmation when successful', async () => {
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

    it('shows error if magic link is clicked without an email', async () => {
      render(<LoginForm />)
      fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

      await waitFor(() => {
        expect(screen.getByText(/enter your email/i)).toBeInTheDocument()
      })
      expect(mockSignInWithOtp).not.toHaveBeenCalled()
    })

    it('shows error when OTP request fails', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } })
      render(<LoginForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

      await waitFor(() => {
        expect(screen.getByText('Email rate limit exceeded')).toBeInTheDocument()
      })
      expect(screen.queryByText(/magic link sent/i)).not.toBeInTheDocument()
    })

    it('shows loading text while sending magic link', async () => {
      let resolve!: (v: { error: null }) => void
      mockSignInWithOtp.mockReturnValue(new Promise(r => { resolve = r }))

      render(<LoginForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

      await screen.findByRole('button', { name: /signing in/i })
      resolve({ error: null })
    })

    it('includes emailRedirectTo pointing to /auth/callback', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null })
      render(<LoginForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

      await waitFor(() => {
        expect(mockSignInWithOtp).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({
              emailRedirectTo: expect.stringContaining('/auth/callback'),
            }),
          })
        )
      })
    })
  })
})
