import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExchangeCodeForSession = vi.fn()
const mockFrom = vi.fn()
const mockRedirect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
    from: mockFrom,
  })),
}))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: vi.fn((url: URL) => ({ status: 307, headers: { location: url.toString() } })),
  },
}))

describe('auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('redirects to / on successful code exchange', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null,
    })

    const selectMock = { eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ workspace_id: 'ws-1' }] }) }
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue(selectMock) })

    const { GET } = await import('@/app/(auth)/auth/callback/route')
    const { NextResponse } = await import('next/server')

    await GET(new Request('http://localhost:3000/auth/callback?code=abc123'))

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(NextResponse.redirect).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/' }))
  })

  it('creates workspace for new user with no existing membership', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-new', email: 'new@test.com' } },
      error: null,
    })

    const insertWorkspaceMock = { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ws-new' } }) }
    const insertMemberMock = { mockResolvedValue: vi.fn() }
    const noMemberships = { eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [] }) }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn().mockReturnValue(noMemberships),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      if (table === 'workspaces') {
        return { insert: vi.fn().mockReturnValue(insertWorkspaceMock) }
      }
      return {}
    })

    const { GET } = await import('@/app/(auth)/auth/callback/route')
    await GET(new Request('http://localhost:3000/auth/callback?code=newuser'))

    expect(mockFrom).toHaveBeenCalledWith('workspace_members')
    expect(mockFrom).toHaveBeenCalledWith('workspaces')
  })

  it('redirects to /login on missing code', async () => {
    const { GET } = await import('@/app/(auth)/auth/callback/route')
    const { NextResponse } = await import('next/server')

    await GET(new Request('http://localhost:3000/auth/callback'))

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/login' })
    )
  })
})
