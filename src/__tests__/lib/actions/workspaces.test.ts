import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('acceptInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('You must be signed in to accept an invite.')
  })

  it('calls accept_workspace_invite and returns the workspace id on success', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ws-1', error: null })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    const result = await acceptInvite('tok-1')

    expect(mockRpc).toHaveBeenCalledWith('accept_workspace_invite', { p_token: 'tok-1' })
    expect(result).toEqual({ workspaceId: 'ws-1' })
  })

  it('surfaces a friendly error for an invalid or already-used invite', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_invite' } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('Invite not found. It may have expired or been revoked.')
  })

  it('surfaces a friendly error when the signed-in email does not match the invite', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'invite_email_mismatch' } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('This invite was sent to a different email address.')
  })
})
