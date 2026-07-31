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

function makeDefaultChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
  }
}

function makeFrom(tableOverrides: Record<string, () => unknown>) {
  return (table: string) => {
    if (tableOverrides[table]) return tableOverrides[table]()
    return makeDefaultChain()
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
        { id: 'node1', entity_type: 'page', entity_id: 'page1', similarity: 0.9 },
        { id: 'node2', entity_type: 'page', entity_id: 'page2', similarity: 0.8 },
      ],
      error: null,
    })
    mockEdgesOr.mockResolvedValue({
      data: [{ source_node_id: 'node1', target_node_id: 'node3' }],
    })
    mockNodesIn.mockResolvedValue({
      data: [{ id: 'node3', entity_type: 'page', entity_id: 'page3' }],
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
    expect(results[2].nodeId).toBe('node3')
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
