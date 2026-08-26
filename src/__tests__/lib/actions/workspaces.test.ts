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

function makeTableResolvers() {
  const resolvers: Record<string, ReturnType<typeof vi.fn>> = {}
  function builderFor(table: string) {
    if (!resolvers[table]) resolvers[table] = vi.fn().mockReturnValue({ data: null, error: null })
    const resolver = resolvers[table]
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => builder),
      then: (resolve: (v: unknown) => void) => resolve(resolver()),
    }
    return builder
  }
  return { resolvers, builderFor }
}
const { resolvers, builderFor } = makeTableResolvers()
function queueOnce(table: string, value: unknown) {
  if (!resolvers[table]) resolvers[table] = vi.fn().mockReturnValue({ data: null, error: null })
  resolvers[table].mockReturnValueOnce(value)
}

describe('getWorkspaceDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('resolves member emails via the workspace RPC', async () => {
    queueOnce('workspaces', { data: { id: 'ws-1', name: 'Acme', owner_id: 'u1' }, error: null })
    queueOnce('workspace_members', { data: [{ user_id: 'u1', role: 'owner' }, { user_id: 'u2', role: 'editor' }], error: null })
    mockRpc.mockResolvedValueOnce({
      data: [{ user_id: 'u1', email: 'owner@example.com' }, { user_id: 'u2', email: 'editor@example.com' }],
      error: null,
    })
    queueOnce('workspace_invites', { data: [], error: null })

    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    const result = await getWorkspaceDetails('ws-1')

    expect(mockRpc).toHaveBeenCalledWith('get_workspace_member_emails', { p_workspace_id: 'ws-1' })
    expect(result.members).toEqual([
      { user_id: 'u1', role: 'owner', email: 'owner@example.com' },
      { user_id: 'u2', role: 'editor', email: 'editor@example.com' },
    ])
  })

  it('throws when the workspace does not exist', async () => {
    queueOnce('workspaces', { data: null, error: null })
    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    await expect(getWorkspaceDetails('ghost')).rejects.toThrow('Workspace not found')
  })
})
