import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockRpc = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/app/(auth)/invite/[token]/AcceptInviteClient', () => ({
  AcceptInviteClient: (props: { invitedEmail: string; workspaceName: string }) => (
    <div data-testid="accept-invite-stub">Accept {props.invitedEmail} into {props.workspaceName}</div>
  ),
}))

function queueInvite(data: unknown) {
  mockRpc.mockReturnValueOnce({ maybeSingle: vi.fn().mockResolvedValue({ data }) })
}

async function renderPage(token = 'tok-1') {
  const mod = await import('@/app/(auth)/invite/[token]/page')
  const InvitePage = mod.default
  const element = await InvitePage({ params: Promise.resolve({ token }) })
  return render(element)
}

describe('InvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('shows an invalid-invite message when the token does not resolve', async () => {
    queueInvite(null)
    await renderPage()

    expect(screen.getByText('Invalid invite')).toBeInTheDocument()
    expect(screen.getByText(/This invite link is invalid or has been revoked/)).toBeInTheDocument()
  })

  it('renders the accept form for a pending invite', async () => {
    queueInvite({ workspace_id: 'ws-1', workspace_name: 'Acme', invited_email: 'a@b.com', role: 'editor', accepted_at: null })
    await renderPage()

    expect(screen.getByText('Join Acme')).toBeInTheDocument()
    expect(screen.getByTestId('accept-invite-stub')).toHaveTextContent('Accept a@b.com into Acme')
  })

  it('shows an already-used message and a link to the app when the invite was already accepted', async () => {
    queueInvite({ workspace_id: 'ws-1', workspace_name: 'Acme', invited_email: 'a@b.com', role: 'editor', accepted_at: '2026-01-01T00:00:00.000Z' })
    await renderPage()

    expect(screen.getByText(/This invite has already been used/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to app' })).toBeInTheDocument()
    expect(screen.queryByTestId('accept-invite-stub')).not.toBeInTheDocument()
  })

  it('queries get_invite_by_token with the route token', async () => {
    queueInvite({ workspace_id: 'ws-1', workspace_name: 'Acme', invited_email: 'a@b.com', role: 'editor', accepted_at: null })
    await renderPage('tok-42')

    expect(mockRpc).toHaveBeenCalledWith('get_invite_by_token', { p_token: 'tok-42' })
  })
})
