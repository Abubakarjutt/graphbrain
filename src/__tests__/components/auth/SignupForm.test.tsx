import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SignupForm } from '@/components/auth/SignupForm'

const mockSignUp = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signUp: mockSignUp },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders email and password fields', () => {
      render(<SignupForm />)
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
    })

    it('renders a Create account submit button', () => {
      render(<SignupForm />)
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })

    it('password field enforces minLength of 8', () => {
      render(<SignupForm />)
      const passwordField = screen.getByLabelText('Password')
      expect(passwordField).toHaveAttribute('minLength', '8')
    })

    it('does not show an error on initial render', () => {
      render(<SignupForm />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('successful signup', () => {
    it('calls signUp with entered email and password', async () => {
      mockSignUp.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
      render(<SignupForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'new@test.com', password: 'password123' })
        )
      })
    })

    it('includes emailRedirectTo pointing to /auth/callback', async () => {
      mockSignUp.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
      render(<SignupForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({
              emailRedirectTo: expect.stringContaining('/auth/callback'),
            }),
          })
        )
      })
    })

    it('navigates to / via full page load when session is returned immediately (confirmations disabled)', async () => {
      mockSignUp.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
      Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
      render(<SignupForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect((window.location as { href: string }).href).toBe('/')
      })
    })

    it('redirects to /login with confirmation message when email confirmation is required', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null }, error: null })
      render(<SignupForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/login'))
      })
      const url = mockPush.mock.calls[0][0] as string
      expect(url).toMatch(/message=/i)
    })
  })

  describe('failed signup', () => {
    it('shows error message when signUp returns an error', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null }, error: { message: 'Email already registered' } })
      render(<SignupForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText('Email already registered')).toBeInTheDocument()
      })
    })

    it('does not navigate on error', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null }, error: { message: 'Email already registered' } })
      render(<SignupForm />)

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => expect(screen.getByText('Email already registered')).toBeInTheDocument())
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('clears previous error when a new signup is attempted', async () => {
      mockSignUp
        .mockResolvedValueOnce({ data: { session: null }, error: { message: 'Email already registered' } })
        .mockResolvedValueOnce({ data: { session: { access_token: 'tok' } }, error: null })

      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => expect(screen.getByText('Email already registered')).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.queryByText('Email already registered')).not.toBeInTheDocument()
      })
    })
  })

  describe('loading state', () => {
    it('shows loading text while signup is in progress', async () => {
      let resolve!: (v: { data: { session: null }; error: null }) => void
      mockSignUp.mockReturnValue(new Promise(r => { resolve = r }))

      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      expect(await screen.findByRole('button', { name: /creating account/i })).toBeInTheDocument()
      resolve({ data: { session: null }, error: null })
    })

    it('disables the submit button while loading', async () => {
      let resolve!: (v: { data: { session: null }; error: null }) => void
      mockSignUp.mockReturnValue(new Promise(r => { resolve = r }))

      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      const btn = await screen.findByRole('button', { name: /creating account/i })
      expect(btn).toBeDisabled()
      resolve({ data: { session: null }, error: null })
    })
  })
})
