import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

async function getMiddleware() {
  const mod = await import('@/middleware')
  return mod.middleware
}

function makeSupabaseMock(user: object | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    cookies: { getAll: vi.fn().mockReturnValue([]), setAll: vi.fn() },
  }
}

describe('middleware', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('redirects unauthenticated user from app route to /login', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/workspace/abc')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('redirects authenticated user from /login to /', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(
      makeSupabaseMock({ id: 'user-1', email: 'a@b.com' }) as any
    )

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/login')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('allows authenticated user through to app route', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(
      makeSupabaseMock({ id: 'user-1' }) as any
    )

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/workspace/abc')
    const response = await middleware(request)

    expect(response.status).toBe(200)
  })

  it('allows unauthenticated user to access /signup', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/signup')
    const response = await middleware(request)

    expect(response.status).toBe(200)
  })
})
