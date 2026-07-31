import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/graph/ollama', () => ({ embed: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/graph/ollama'
import type { Mock } from 'vitest'

const mockRpc = vi.fn()
const mockEdgesOr = vi.fn()
const mockEdgesSelect = vi.fn(() => ({ or: mockEdgesOr }))
const mockNodesIn = vi.fn()
const mockNodesSelect = vi.fn(() => ({ in: mockNodesIn }))

// Returns a chain that supports select/in/order/eq/maybeSingle/limit for batch queries
function makeBatchChain(data: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  const resolve = () => Promise.resolve({ data })
  chain.select = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(resolve)
  chain.limit = vi.fn(resolve)
  // make the chain itself thenable so awaiting works
  chain.then = (onfulfilled: (v: { data: unknown[] }) => unknown) =>
    Promise.resolve({ data }).then(onfulfilled)
  return chain
}

function makeFrom(tableOverrides: Record<string, () => unknown>) {
  return (table: string) => {
    if (tableOverrides[table]) return tableOverrides[table]()
    return makeBatchChain()
  }
}

describe('retrieveNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ;(embed as Mock).mockResolvedValue(new Array(768).fill(0.1))
  })

  it('returns top nodes plus 1-hop expanded nodes, deduped', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: '11111111-0000-0000-0000-000000000001', entity_type: 'page', entity_id: 'aaaa0000-0000-0000-0000-000000000001', similarity: 0.9 },
        { id: '11111111-0000-0000-0000-000000000002', entity_type: 'page', entity_id: 'aaaa0000-0000-0000-0000-000000000002', similarity: 0.8 },
      ],
      error: null,
    })
    mockEdgesOr.mockResolvedValue({
      data: [{ source_node_id: '11111111-0000-0000-0000-000000000001', target_node_id: '11111111-0000-0000-0000-000000000003' }],
    })
    mockNodesIn.mockResolvedValue({
      data: [{ id: '11111111-0000-0000-0000-000000000003', entity_type: 'page', entity_id: 'aaaa0000-0000-0000-0000-000000000003' }],
    })
    ;(createClient as Mock).mockResolvedValue({
      rpc: mockRpc,
      from: makeFrom({
        edges: () => ({ select: mockEdgesSelect }),
        nodes: () => ({ select: mockNodesSelect }),
      }),
    })

    const { retrieveNodes } = await import('@/lib/graph/query')
    const results = await retrieveNodes('ws1', 'test query')
    expect(results).toHaveLength(3)
    expect(results[0].score).toBe(0.9)
    expect(results[2].nodeId).toBe('11111111-0000-0000-0000-000000000003')
    expect(results[2].score).toBe(0)
  })

  it('passes databaseId scope to rpc', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockEdgesOr.mockResolvedValue({ data: [] })
    ;(createClient as Mock).mockResolvedValue({
      rpc: mockRpc,
      from: makeFrom({ edges: () => ({ select: mockEdgesSelect }) }),
    })

    const { retrieveNodes } = await import('@/lib/graph/query')
    await retrieveNodes('ws1', 'test', { databaseId: 'db1' })
    expect(mockRpc).toHaveBeenCalledWith('match_nodes', expect.objectContaining({
      match_database_id: 'db1',
    }))
  })

  it('propagates error when embed() throws', async () => {
    ;(embed as Mock).mockRejectedValue(new Error('Ollama down'))
    ;(createClient as Mock).mockResolvedValue({ rpc: mockRpc, from: vi.fn() })

    const { retrieveNodes } = await import('@/lib/graph/query')
    await expect(retrieveNodes('ws1', 'test')).rejects.toThrow('Ollama down')
  })
})
