import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SignupForm } from '@/components/auth/SignupForm'
import { createWorkspace, sendInvite } from '@/lib/actions/workspaces'

const mockSignUp = vi.fn()
const mockGetUser = vi.fn()
const mockSingle = vi.fn()
const mockLimit = vi.fn(() => ({ single: mockSingle }))
const mockEq = vi.fn(() => ({ limit: mockLimit }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signUp: mockSignUp, getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/actions/workspaces', () => ({
  createWorkspace: vi.fn(),
  sendInvite: vi.fn(),
}))

// Advances the form from Step 1 (Account) to Step 2 (Organization) with a
// successful signUp — the shared setup every Step 2+ test builds on.
async function advanceToOrgStep() {
  render(<SignupForm />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(screen.getByLabelText('Organization name')).toBeInTheDocument())
}

// Advances from Step 2 through to Step 3 (Invite) with a successful create.
async function advanceToInviteStep() {
  await advanceToOrgStep()
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Acme Inc.' } })
  fireEvent.click(screen.getByRole('button', { name: /create organization/i }))
  await waitFor(() => expect(screen.getByText('Invite teammates')).toBeInTheDocument())
}

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSingle.mockResolvedValue({ data: { workspace_id: 'ws-1' } })
    vi.mocked(createWorkspace).mockResolvedValue({ id: 'ws-1', name: 'Acme Inc.' })
    vi.mocked(sendInvite).mockResolvedValue({ token: 'tok-1' })
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  describe('Step 1: Account', () => {
    it('renders email and password fields with a Continue button', () => {
      render(<SignupForm />)
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
    })

    it('password field enforces minLength of 8', () => {
      render(<SignupForm />)
      expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '8')
    })

    it('calls signUp with the entered credentials and an emailRedirectTo callback URL', async () => {
      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'new@test.com',
          password: 'password123',
          options: { emailRedirectTo: expect.stringContaining('/auth/callback') },
        })
      })
    })

    it('advances to the Organization step once signUp succeeds', async () => {
      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(screen.getByLabelText('Organization name')).toBeInTheDocument()
      })
    })

    it('shows the error message and stays on Step 1 when signUp fails', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null }, error: { message: 'Email already registered' } })
      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(screen.getByText('Email already registered')).toBeInTheDocument()
      })
      expect(screen.queryByLabelText('Organization name')).not.toBeInTheDocument()
    })

    it('clears a previous error once a later signup succeeds', async () => {
      mockSignUp
        .mockResolvedValueOnce({ data: { session: null }, error: { message: 'Email already registered' } })
        .mockResolvedValueOnce({ data: { session: null }, error: null })

      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))
      await waitFor(() => expect(screen.getByText('Email already registered')).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(screen.queryByText('Email already registered')).not.toBeInTheDocument()
      })
    })

    it('shows loading text and disables the button while signUp is pending', async () => {
      let resolve!: (v: { data: { session: null }; error: null }) => void
      mockSignUp.mockReturnValue(new Promise(r => { resolve = r }))

      render(<SignupForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))

      const btn = await screen.findByRole('button', { name: /creating account/i })
      expect(btn).toBeDisabled()
      resolve({ data: { session: null }, error: null })
    })
  })

  describe('Step 2: Organization', () => {
    it('shows a validation error and does not call createWorkspace for a whitespace-only name', async () => {
      await advanceToOrgStep()
      fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: '   ' } })
      fireEvent.click(screen.getByRole('button', { name: /create organization/i }))

      await waitFor(() => {
        expect(screen.getByText('Please enter an organization name.')).toBeInTheDocument()
      })
      expect(createWorkspace).not.toHaveBeenCalled()
    })

    it('calls createWorkspace with the trimmed name and advances to the Invite step', async () => {
      await advanceToOrgStep()
      fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: '  Acme Inc.  ' } })
      fireEvent.click(screen.getByRole('button', { name: /create organization/i }))

      await waitFor(() => {
        expect(createWorkspace).toHaveBeenCalledWith('Acme Inc.')
      })
      await waitFor(() => {
        expect(screen.getByText('Invite teammates')).toBeInTheDocument()
      })
    })

    it('shows the thrown error message and stays on Step 2 when createWorkspace fails', async () => {
      vi.mocked(createWorkspace).mockRejectedValueOnce(new Error('Workspace name already taken'))
      await advanceToOrgStep()
      fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Acme Inc.' } })
      fireEvent.click(screen.getByRole('button', { name: /create organization/i }))

      await waitFor(() => {
        expect(screen.getByText('Workspace name already taken')).toBeInTheDocument()
      })
      expect(screen.queryByText('Invite teammates')).not.toBeInTheDocument()
    })

    it('shows loading text while the workspace is being created', async () => {
      let resolve!: (v: { id: string; name: string }) => void
      vi.mocked(createWorkspace).mockReturnValue(new Promise(r => { resolve = r }))
      await advanceToOrgStep()
      fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Acme Inc.' } })
      fireEvent.click(screen.getByRole('button', { name: /create organization/i }))

      expect(await screen.findByRole('button', { name: /creating organization/i })).toBeInTheDocument()
      resolve({ id: 'ws-1', name: 'Acme Inc.' })
    })
  })

  describe('Step 3: Invite teammates', () => {
    it('renders one empty invite row, an "Add another" control, and a role toggle', async () => {
      await advanceToInviteStep()
      expect(screen.getByPlaceholderText('teammate@company.com')).toHaveValue('')
      expect(screen.getByText('Add another')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'editor' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'viewer' })).toBeInTheDocument()
    })

    it('adds another empty invite row when "Add another" is clicked', async () => {
      await advanceToInviteStep()
      fireEvent.click(screen.getByText('Add another'))
      expect(screen.getAllByPlaceholderText('teammate@company.com')).toHaveLength(2)
    })

    it('removes an added row when its remove button is clicked', async () => {
      await advanceToInviteStep()
      fireEvent.click(screen.getByText('Add another'))
      expect(screen.getAllByPlaceholderText('teammate@company.com')).toHaveLength(2)

      fireEvent.click(screen.getAllByLabelText('Remove')[0])
      expect(screen.getAllByPlaceholderText('teammate@company.com')).toHaveLength(1)
    })

    it('skips straight to the workspace when submitted with no invite emails', async () => {
      await advanceToInviteStep()
      fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

      await waitFor(() => {
        expect((window.location as unknown as { href: string }).href).toBe('/')
      })
      expect(sendInvite).not.toHaveBeenCalled()
    })

    it('sends an invite and shows the generated link instead of navigating away', async () => {
      await advanceToInviteStep()
      fireEvent.change(screen.getByPlaceholderText('teammate@company.com'), { target: { value: 'teammate@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

      await waitFor(() => {
        expect(sendInvite).toHaveBeenCalledWith('ws-1', 'teammate@test.com', 'editor')
      })
      expect(screen.getByText('Share these links with your teammates:')).toBeInTheDocument()
      expect((window.location as unknown as { href: string }).href).toBe('')
    })

    it('excludes the account owner\'s own email from the invite list', async () => {
      await advanceToInviteStep()
      fireEvent.change(screen.getByPlaceholderText('teammate@company.com'), { target: { value: 'new@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

      await waitFor(() => {
        expect((window.location as unknown as { href: string }).href).toBe('/')
      })
      expect(sendInvite).not.toHaveBeenCalled()
    })

    it('sends invites with the "viewer" role once selected', async () => {
      await advanceToInviteStep()
      fireEvent.click(screen.getByRole('button', { name: 'viewer' }))
      fireEvent.change(screen.getByPlaceholderText('teammate@company.com'), { target: { value: 'teammate@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

      await waitFor(() => {
        expect(sendInvite).toHaveBeenCalledWith('ws-1', 'teammate@test.com', 'viewer')
      })
    })

    it('shows an error when the session cannot be verified', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
      await advanceToInviteStep()
      fireEvent.change(screen.getByPlaceholderText('teammate@company.com'), { target: { value: 'teammate@test.com' } })
      fireEvent.click(screen.getByRole('button', { name: /send invites/i }))

      await waitFor(() => {
        expect(screen.getByText('Session expired — please sign in again.')).toBeInTheDocument()
      })
    })

    it('navigates to the workspace immediately when "Skip for now" is clicked', async () => {
      await advanceToInviteStep()
      fireEvent.click(screen.getByText('Skip for now'))

      expect((window.location as unknown as { href: string }).href).toBe('/')
      expect(sendInvite).not.toHaveBeenCalled()
    })
  })
})
