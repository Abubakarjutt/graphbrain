import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/graph/query', () => ({ retrieveNodes: vi.fn() }))
vi.mock('@/lib/graph/ollama', () => ({ streamChat: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { retrieveNodes } from '@/lib/graph/query'
import { streamChat } from '@/lib/graph/ollama'
import type { Mock } from 'vitest'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

const fakeSource = {
  nodeId: 'n1', entityType: 'page' as const, entityId: 'p1',
  title: 'Graph RAG Design', excerpt: 'We used LlamaIndex.',
  projectName: 'Project Alpha', projectDatabaseId: 'db1', score: 0.9,
}

function makeSupabase(user: { id: string } | null) {
  const mockInsert = vi.fn().mockResolvedValue({ error: null })
  // workspace_members check: returns member when user is present
  const mockMaybySingle = vi.fn().mockResolvedValue({ data: user ? { user_id: user.id } : null })
  const eqChain = { eq: vi.fn(), maybeSingle: mockMaybySingle }
  eqChain.eq = vi.fn(() => eqChain)

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') return { select: () => eqChain }
      return { insert: mockInsert }
    }),
    _mockInsert: mockInsert,
  }
}

beforeEach(() => { vi.clearAllMocks(); vi.resetModules() })

describe('POST /api/query/ask', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(createClient as Mock).mockResolvedValue(makeSupabase(null))
    const { POST } = await import('@/app/api/query/ask/route')
    const res = await POST(new Request('http://localhost/api/query/ask', { method: 'POST', body: JSON.stringify({ workspaceId: WORKSPACE_ID, query: 'test' }) }))
    expect(res.status).toBe(401)
  })

  it('streams tokens and sets X-Sources header', async () => {
    ;(createClient as Mock).mockResolvedValue(makeSupabase({ id: 'u1' }))
    ;(retrieveNodes as Mock).mockResolvedValue([fakeSource])
    async function* gen() { yield 'Hello'; yield ' world' }
    ;(streamChat as Mock).mockReturnValue(gen())
    const { POST } = await import('@/app/api/query/ask/route')
    const res = await POST(new Request('http://localhost/api/query/ask', { method: 'POST', body: JSON.stringify({ workspaceId: WORKSPACE_ID, query: 'What is Graph RAG?' }) }))
    expect(res.status).toBe(200)
    const sources = JSON.parse(res.headers.get('X-Sources')!)
    expect(sources[0].title).toBe('Graph RAG Design')
    expect(await res.text()).toBe('Hello world')
  })

  it('logs to query_logs after stream completes', async () => {
    const supabase = makeSupabase({ id: 'u1' })
    ;(createClient as Mock).mockResolvedValue(supabase)
    ;(retrieveNodes as Mock).mockResolvedValue([fakeSource])
    async function* gen() { yield 'Answer' }
    ;(streamChat as Mock).mockReturnValue(gen())
    const { POST } = await import('@/app/api/query/ask/route')
    const res = await POST(new Request('http://localhost/api/query/ask', { method: 'POST', body: JSON.stringify({ workspaceId: WORKSPACE_ID, query: 'test' }) }))
    await res.text()
    expect(supabase._mockInsert).toHaveBeenCalledWith(expect.objectContaining({ query: 'test', response: 'Answer' }))
  })
})
