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
    mockGetUser.mockReset()
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

  it('surfaces the generic error message for any other RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'something else broke' } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('something else broke')
  })
})

function makeTableResolvers() {
  const resolvers: Record<string, ReturnType<typeof vi.fn>> = {}
  function builderFor(table: string) {
    if (!resolvers[table]) resolvers[table] = vi.fn().mockReturnValue({ data: null, error: null })
    const resolver = resolvers[table]
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      delete: vi.fn(() => builder),
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
    mockGetUser.mockReset()
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

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    await expect(getWorkspaceDetails('ws-1')).rejects.toThrow('Unauthenticated')
  })

  // BUG: see docs/testing-report-2026-08-28.md
  it('silently blanks every member email when the email-lookup RPC errors, instead of surfacing the error', async () => {
    queueOnce('workspaces', { data: { id: 'ws-1', name: 'Acme', owner_id: 'u1' }, error: null })
    queueOnce('workspace_members', { data: [{ user_id: 'u1', role: 'owner' }], error: null })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })
    queueOnce('workspace_invites', { data: [], error: null })

    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    const result = await getWorkspaceDetails('ws-1')

    expect(result.members).toEqual([{ user_id: 'u1', role: 'owner', email: '' }])
  })

  it('defaults members and invites to empty arrays when their queries return null data', async () => {
    queueOnce('workspaces', { data: { id: 'ws-1', name: 'Acme', owner_id: 'u1' }, error: null })
    queueOnce('workspace_members', { data: null, error: null })
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    queueOnce('workspace_invites', { data: null, error: null })

    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    const result = await getWorkspaceDetails('ws-1')

    expect(result.members).toEqual([])
    expect(result.invites).toEqual([])
  })
})

describe('createWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { createWorkspace } = await import('@/lib/actions/workspaces')
    await expect(createWorkspace('Acme')).rejects.toThrow('Unauthenticated')
  })

  it('creates the workspace and an owner membership row, trimming the name', async () => {
    queueOnce('workspaces', { data: { id: 'ws-1', name: 'Acme' }, error: null })
    queueOnce('workspace_members', { data: null, error: null })
    const { createWorkspace } = await import('@/lib/actions/workspaces')

    const result = await createWorkspace('  Acme  ')

    expect(result).toEqual({ id: 'ws-1', name: 'Acme' })
  })

  it('throws the database error message when the workspace insert fails', async () => {
    queueOnce('workspaces', { data: null, error: { message: 'duplicate key' } })
    const { createWorkspace } = await import('@/lib/actions/workspaces')
    await expect(createWorkspace('Acme')).rejects.toThrow('duplicate key')
  })

  it('falls back to a generic message when the insert fails with no error message', async () => {
    queueOnce('workspaces', { data: null, error: null })
    const { createWorkspace } = await import('@/lib/actions/workspaces')
    await expect(createWorkspace('Acme')).rejects.toThrow('Failed to create workspace')
  })
})

describe('sendInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { sendInvite } = await import('@/lib/actions/workspaces')
    await expect(sendInvite('ws-1', 'a@b.com')).rejects.toThrow('Unauthenticated')
  })

  it('inserts an invite and returns its token, lowercasing/trimming the email, defaulting role to editor', async () => {
    queueOnce('workspace_invites', { data: { token: 'tok-123' }, error: null })
    const { sendInvite } = await import('@/lib/actions/workspaces')

    const result = await sendInvite('ws-1', '  A@Example.com  ')

    expect(result).toEqual({ token: 'tok-123' })
  })

  it('surfaces a friendly message for a duplicate invite (unique constraint violation)', async () => {
    queueOnce('workspace_invites', { data: null, error: { code: '23505', message: 'duplicate key value' } })
    const { sendInvite } = await import('@/lib/actions/workspaces')
    await expect(sendInvite('ws-1', 'a@b.com')).rejects.toThrow('a@b.com has already been invited.')
  })

  it('surfaces the generic database error message for any other failure', async () => {
    queueOnce('workspace_invites', { data: null, error: { code: '42501', message: 'permission denied' } })
    const { sendInvite } = await import('@/lib/actions/workspaces')
    await expect(sendInvite('ws-1', 'a@b.com')).rejects.toThrow('permission denied')
  })
})

describe('revokeInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockReset()
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('deletes the invite scoped to both its id and the workspace', async () => {
    const deleteSpy = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      const builder = builderFor(table)
      const originalDelete = builder.delete as ReturnType<typeof vi.fn>
      builder.delete = vi.fn((...args: unknown[]) => { deleteSpy(...args); return originalDelete(...args) })
      return builder
    })
    queueOnce('workspace_invites', { data: null, error: null })
    const { revokeInvite } = await import('@/lib/actions/workspaces')

    await revokeInvite('invite-1', 'ws-1')

    expect(deleteSpy).toHaveBeenCalled()
  })

  // BUG: see docs/testing-report-2026-08-28.md
  it('does not check whether the signed-in user is authenticated at all', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    queueOnce('workspace_invites', { data: null, error: null })
    const { revokeInvite } = await import('@/lib/actions/workspaces')

    await expect(revokeInvite('invite-1', 'ws-1')).resolves.toBeUndefined()
  })

  // BUG: see docs/testing-report-2026-08-28.md
  it('silently resolves even when the delete itself errors, giving the caller no feedback', async () => {
    queueOnce('workspace_invites', { data: null, error: { message: 'permission denied' } })
    const { revokeInvite } = await import('@/lib/actions/workspaces')

    await expect(revokeInvite('invite-1', 'ws-1')).resolves.toBeUndefined()
  })
})

describe('removeMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { removeMember } = await import('@/lib/actions/workspaces')
    await expect(removeMember('ws-1', 'u2')).rejects.toThrow('Unauthenticated')
  })

  it('throws when the signed-in user tries to remove themselves', async () => {
    const { removeMember } = await import('@/lib/actions/workspaces')
    await expect(removeMember('ws-1', 'u1')).rejects.toThrow('You cannot remove yourself.')
  })

  it('deletes the membership row for another user and revalidates', async () => {
    queueOnce('workspace_members', { data: null, error: null })
    const { removeMember } = await import('@/lib/actions/workspaces')
    await expect(removeMember('ws-1', 'u2')).resolves.toBeUndefined()
  })
})
