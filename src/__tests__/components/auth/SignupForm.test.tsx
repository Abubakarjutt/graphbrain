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

  it('renders email and password fields', () => {
    render(<SignupForm />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('calls signUp with email and password on submit', async () => {
    mockSignUp.mockResolvedValue({ error: null })
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

  it('redirects to /login with confirmation message on success', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    render(<SignupForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/login')
      )
    })
  })

  it('shows error message on failed signup', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'Email already registered' } })
    render(<SignupForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})
