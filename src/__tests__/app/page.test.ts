import { describe, it, expect, vi, beforeEach } from 'vitest'

// next/navigation redirect() throws a special error in real Next.js to halt execution.
// We replicate that so code after redirect() is not reached in tests.
class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT: ${url}`)
  }
}

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new RedirectError(url) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

async function getRootPage() {
  const mod = await import('@/app/page')
  return mod.default
}

function makeWorkspaceChain(workspace: object | null) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: workspace }),
    }),
  }
}

function makeMemberSingleChain(row: object | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: row }),
    }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

/** Run page and return the URL that redirect() was called with. */
async function getRedirectUrl(): Promise<string> {
  const RootPage = await getRootPage()
  try {
    await RootPage()
    return ''
  } catch (e) {
    if (e instanceof RedirectError) return e.url
    throw e
  }
}

describe('RootPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('unauthenticated user', () => {
    it('redirects to /login', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
      // mockFrom intentionally not configured — redirect() throws before it is reached
      expect(await getRedirectUrl()).toBe('/login')
    })

    it('does not query workspace_members', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
      await getRedirectUrl()
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  describe('authenticated user with an existing workspace', () => {
    it('redirects to /workspace/[id]', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
      mockFrom.mockReturnValue(makeMemberSingleChain({ workspace_id: 'ws-abc' }))
      expect(await getRedirectUrl()).toBe('/workspace/ws-abc')
    })

    it('does not create a workspace', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
      mockFrom.mockReturnValue(makeMemberSingleChain({ workspace_id: 'ws-abc' }))
      await getRedirectUrl()
      expect(mockFrom).not.toHaveBeenCalledWith('workspaces')
    })
  })

  describe('authenticated user with no workspace', () => {
    it('creates a workspace automatically', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-new', email: 'new@test.com' } } })

      const memberInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: memberInsert,
          }
        }
        if (table === 'workspaces') return makeWorkspaceChain({ id: 'ws-new' })
        return {}
      })

      await getRedirectUrl()

      expect(mockFrom).toHaveBeenCalledWith('workspaces')
    })

    it('names the workspace after the email prefix', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-bob', email: 'bob@test.com' } } })

      let capturedName: string | null = null
      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'workspaces') {
          return {
            insert: vi.fn().mockImplementation((val: { name: string }) => {
              capturedName = val.name
              return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ws-1' } }) }
            }),
          }
        }
        return {}
      })

      await getRedirectUrl()

      expect(capturedName).toBe("bob's Workspace")
    })

    it('uses "My Workspace" when user has no email', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-no-email' } } })

      let capturedName: string | null = null
      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'workspaces') {
          return {
            insert: vi.fn().mockImplementation((val: { name: string }) => {
              capturedName = val.name
              return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ws-1' } }) }
            }),
          }
        }
        return {}
      })

      await getRedirectUrl()

      expect(capturedName).toBe('My Workspace')
    })

    it('redirects to the newly created workspace', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-new', email: 'new@test.com' } } })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'workspaces') return makeWorkspaceChain({ id: 'ws-brand-new' })
        return {}
      })

      expect(await getRedirectUrl()).toBe('/workspace/ws-brand-new')
    })

    it('falls back to /login if workspace creation returns null', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-new', email: 'new@test.com' } } })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'workspaces') return makeWorkspaceChain(null)
        return {}
      })

      expect(await getRedirectUrl()).toBe('/login')
    })
  })
})
