import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

async function getProxy() {
  const mod = await import('@/proxy')
  return mod.proxy
}

function makeSupabaseMock(user: object | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    cookies: { getAll: vi.fn().mockReturnValue([]), setAll: vi.fn() },
  }
}

describe('proxy (auth middleware)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  describe('unauthenticated user', () => {
    it('redirects from an app route to /login', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

      const proxy = await getProxy()
      const request = new NextRequest('http://localhost:3000/workspace/abc')
      const response = await proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/login')
    })

    it('passes through to /login without redirecting', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

      const proxy = await getProxy()
      const response = await proxy(new NextRequest('http://localhost:3000/login'))

      expect(response.status).toBe(200)
    })

    it('passes through to /signup without redirecting', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

      const proxy = await getProxy()
      const response = await proxy(new NextRequest('http://localhost:3000/signup'))

      expect(response.status).toBe(200)
    })

    it('passes through to /auth/callback without redirecting', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

      const proxy = await getProxy()
      const response = await proxy(new NextRequest('http://localhost:3000/auth/callback?code=abc'))

      expect(response.status).toBe(200)
    })

    it('redirects deeply nested app routes to /login', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

      const proxy = await getProxy()
      const response = await proxy(
        new NextRequest('http://localhost:3000/workspace/ws-1/page/pg-1')
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/login')
    })
  })

  describe('authenticated user', () => {
    it('passes through to an app route', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(
        makeSupabaseMock({ id: 'user-1' }) as any
      )

      const proxy = await getProxy()
      const response = await proxy(new NextRequest('http://localhost:3000/workspace/abc'))

      expect(response.status).toBe(200)
    })

    it('passes through to /login (no server-side bounce — avoids redirect loops)', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(
        makeSupabaseMock({ id: 'user-1', email: 'a@b.com' }) as any
      )

      const proxy = await getProxy()
      const response = await proxy(new NextRequest('http://localhost:3000/login'))

      expect(response.status).toBe(200)
    })

    it('passes through to /signup', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(
        makeSupabaseMock({ id: 'user-1' }) as any
      )

      const proxy = await getProxy()
      const response = await proxy(new NextRequest('http://localhost:3000/signup'))

      expect(response.status).toBe(200)
    })

    it('passes through to / itself', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValue(
        makeSupabaseMock({ id: 'user-1' }) as any
      )

      const proxy = await getProxy()
      const response = await proxy(new NextRequest('http://localhost:3000/'))

      expect(response.status).toBe(200)
    })
  })

  describe('cookie propagation', () => {
    it('returns a response even when supabase sets cookies', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      const captured: { setAll: ((cookies: { name: string; value: string; options?: object }[]) => void) | null } = { setAll: null }

      vi.mocked(createServerClient).mockImplementation((_url, _key, opts: any) => {
        captured.setAll = opts.cookies.setAll
        return makeSupabaseMock(null) as any
      })

      const proxy = await getProxy()
      const request = new NextRequest('http://localhost:3000/login')
      const response = await proxy(request)

      // Simulate Supabase calling setAll to refresh cookies
      captured.setAll?.([{ name: 'sb-token', value: 'new-val', options: { httpOnly: true } }])

      expect(response).toBeDefined()
    })
  })
})
