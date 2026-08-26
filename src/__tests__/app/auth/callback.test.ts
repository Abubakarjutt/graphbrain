import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExchangeCodeForSession = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
    from: mockFrom,
  })),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    redirect: vi.fn((url: URL) => ({
      status: 307,
      headers: { location: url.toString() },
      url: url.toString(),
    })),
  },
}))

function makeWorkspaceMemberChain(memberships: object[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: memberships }),
    }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function makeWorkspaceChain(workspace: object | null) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: workspace }),
    }),
  }
}

describe('auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('missing or invalid code', () => {
    it('redirects to /login when code param is absent', async () => {
      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback'))

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/login' })
      )
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    })

    it('includes error=auth_callback_failed in the /login redirect when code is absent', async () => {
      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback'))

      const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL
      expect(redirectUrl.searchParams.get('error')).toBe('auth_callback_failed')
    })
  })

  describe('failed code exchange', () => {
    it('redirects to /login when exchangeCodeForSession returns an error', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid code' },
      })

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback?code=bad-code'))

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/login' })
      )
    })

    it('redirects to /login when exchangeCodeForSession returns null user', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback?code=any'))

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/login' })
      )
    })
  })

  describe('successful code exchange — returning user with workspace', () => {
    it('redirects to / without creating a new workspace', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'a@b.com' } },
        error: null,
      })
      mockFrom.mockReturnValue(makeWorkspaceMemberChain([{ workspace_id: 'ws-1' }]))

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback?code=abc123'))

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123')
      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/' })
      )
      // workspaces table should not have been touched
      expect(mockFrom).not.toHaveBeenCalledWith('workspaces')
    })
  })

  describe('successful code exchange — new user with no workspace', () => {
    it('creates a workspace and membership for a new user', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-new', email: 'new@test.com' } },
        error: null,
      })

      const memberInsert = vi.fn().mockResolvedValue({ data: null, error: null })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }),
            insert: memberInsert,
          }
        }
        if (table === 'workspaces') return makeWorkspaceChain({ id: 'ws-new' })
        return {}
      })

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      await GET(new Request('http://localhost:3000/auth/callback?code=newuser'))

      expect(mockFrom).toHaveBeenCalledWith('workspaces')
      expect(mockFrom).toHaveBeenCalledWith('workspace_members')
      expect(memberInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-new', user_id: 'user-new', role: 'owner' })
      )
    })

    it('names the workspace after the email prefix', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-new', email: 'alice@example.com' } },
        error: null,
      })

      let capturedWorkspaceName: string | null = null
      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'workspaces') {
          return {
            insert: vi.fn().mockImplementation((val: { name: string }) => {
              capturedWorkspaceName = val.name
              return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ws-1' } }) }
            }),
          }
        }
        return {}
      })

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      await GET(new Request('http://localhost:3000/auth/callback?code=email-user'))

      expect(capturedWorkspaceName).toBe("alice's Workspace")
    })

    it('uses "My Workspace" as the name when user has no email', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-no-email' } },
        error: null,
      })

      let capturedWorkspaceName: string | null = null
      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'workspaces') {
          return {
            insert: vi.fn().mockImplementation((val: { name: string }) => {
              capturedWorkspaceName = val.name
              return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ws-1' } }) }
            }),
          }
        }
        return {}
      })

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      await GET(new Request('http://localhost:3000/auth/callback?code=no-email'))

      expect(capturedWorkspaceName).toBe('My Workspace')
    })

    it('still redirects to / even when workspace creation fails', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-new', email: 'new@test.com' } },
        error: null,
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'workspaces') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
          }
        }
        return {}
      })

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback?code=fail-ws'))

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/' })
      )
    })
  })

  describe('next param', () => {
    it('honours the next query param as the redirect destination', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'a@b.com' } },
        error: null,
      })
      mockFrom.mockReturnValue(makeWorkspaceMemberChain([{ workspace_id: 'ws-1' }]))

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback?code=abc&next=/workspace/ws-1'))

      const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/workspace/ws-1')
    })

    it('defaults to / when next param is absent', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'a@b.com' } },
        error: null,
      })
      mockFrom.mockReturnValue(makeWorkspaceMemberChain([{ workspace_id: 'ws-1' }]))

      const { GET } = await import('@/app/(auth)/auth/callback/route')
      const { NextResponse } = await import('next/server')

      await GET(new Request('http://localhost:3000/auth/callback?code=abc'))

      const redirectUrl = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/')
    })
  })
})
