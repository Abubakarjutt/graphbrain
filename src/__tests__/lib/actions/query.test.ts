import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/graph/query', () => ({ retrieveNodes: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { retrieveNodes } from '@/lib/graph/query'
import { createClient } from '@/lib/supabase/server'
import type { Mock } from 'vitest'

const mockIlike = vi.fn()
const mockLimit = vi.fn()
const mockEq = vi.fn(() => ({ ilike: mockIlike }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  ;(createClient as Mock).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })
  mockIlike.mockReturnValue({ limit: mockLimit })
  mockLimit.mockResolvedValue({ data: [] })
})

describe('searchQuery', () => {
  it('returns SearchResult[] from retrieveNodes on success', async () => {
    const fakeResults = [{ nodeId: 'n1', title: 'Page A', score: 0.9 }]
    ;(retrieveNodes as Mock).mockResolvedValue(fakeResults)
    const { searchQuery } = await import('@/lib/actions/query')
    const result = await searchQuery('ws1', 'graph rag')
    expect(result).toEqual(fakeResults)
  })

  it('falls back to ILIKE on Ollama error', async () => {
    ;(retrieveNodes as Mock).mockRejectedValue(new Error('Ollama down'))
    mockLimit.mockResolvedValue({ data: [{ id: 'p1', title: 'Graph RAG Project' }] })
    const { searchQuery } = await import('@/lib/actions/query')
    const result = await searchQuery('ws1', 'graph rag')
    const arr = result as { title: string; excerpt: string }[]
    expect(arr[0].title).toBe('Graph RAG Project')
    expect(arr[0].excerpt).toBe('(text search — AI features unavailable)')
  })

  it('returns error object if unauthenticated', async () => {
    ;(createClient as Mock).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: mockFrom,
    })
    const { searchQuery } = await import('@/lib/actions/query')
    const result = await searchQuery('ws1', 'test')
    expect(result).toEqual({ error: 'Unauthenticated' })
  })
})
