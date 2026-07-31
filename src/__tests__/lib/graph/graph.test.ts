import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── nodes table ──────────────────────────────────────────────────
const mockNodesUpsertSingle = vi.fn()
const mockNodesUpsertSelect = vi.fn(() => ({ single: mockNodesUpsertSingle }))
const mockNodesUpsert = vi.fn(() => ({ select: mockNodesUpsertSelect }))

const mockNodesUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockNodesUpdate = vi.fn(() => ({ eq: mockNodesUpdateEq }))

const mockNodesMaybeSingle = vi.fn()
const mockNodesSelectEq2 = vi.fn(() => ({ maybeSingle: mockNodesMaybeSingle }))
const mockNodesSelectEq1 = vi.fn(() => ({ eq: mockNodesSelectEq2 }))
const mockNodesSelect = vi.fn(() => ({ eq: mockNodesSelectEq1 }))

// ── edges table ──────────────────────────────────────────────────
const mockEdgesUpsert = vi.fn().mockResolvedValue({ error: null })
const mockEdgesDeleteEq2 = vi.fn().mockResolvedValue({ error: null })
const mockEdgesDeleteEq1 = vi.fn(() => ({ eq: mockEdgesDeleteEq2 }))
const mockEdgesDelete = vi.fn(() => ({ eq: mockEdgesDeleteEq1 }))

// ── pages table (for findPageNodeByTitle) ──────────────────────
const mockPagesMaybeSingle = vi.fn()
const mockPagesSelectEq2 = vi.fn(() => ({ maybeSingle: mockPagesMaybeSingle }))
const mockPagesSelectEq1 = vi.fn(() => ({ eq: mockPagesSelectEq2 }))
const mockPagesSelect = vi.fn(() => ({ eq: mockPagesSelectEq1 }))

const mockFrom = vi.fn((table: string) => {
  switch (table) {
    case 'nodes': return { upsert: mockNodesUpsert, update: mockNodesUpdate, select: mockNodesSelect }
    case 'edges': return { upsert: mockEdgesUpsert, delete: mockEdgesDelete }
    case 'pages': return { select: mockPagesSelect }
    default: return {}
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })),
}))
vi.mock('@/lib/graph/ollama', () => ({
  embed: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
}))

describe('graph actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockNodesUpsertSingle.mockResolvedValue({ data: { id: 'n1' }, error: null })
    mockNodesUpsertSelect.mockImplementation(() => ({ single: mockNodesUpsertSingle }))
    mockNodesUpsert.mockImplementation(() => ({ select: mockNodesUpsertSelect }))
    mockNodesUpdateEq.mockResolvedValue({ error: null })
    mockNodesUpdate.mockImplementation(() => ({ eq: mockNodesUpdateEq }))
    mockNodesMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockNodesSelectEq2.mockImplementation(() => ({ maybeSingle: mockNodesMaybeSingle }))
    mockNodesSelectEq1.mockImplementation(() => ({ eq: mockNodesSelectEq2 }))
    mockNodesSelect.mockImplementation(() => ({ eq: mockNodesSelectEq1 }))
    mockEdgesUpsert.mockResolvedValue({ error: null })
    mockEdgesDeleteEq2.mockResolvedValue({ error: null })
    mockEdgesDeleteEq1.mockImplementation(() => ({ eq: mockEdgesDeleteEq2 }))
    mockEdgesDelete.mockImplementation(() => ({ eq: mockEdgesDeleteEq1 }))
    mockPagesMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockPagesSelectEq2.mockImplementation(() => ({ maybeSingle: mockPagesMaybeSingle }))
    mockPagesSelectEq1.mockImplementation(() => ({ eq: mockPagesSelectEq2 }))
    mockPagesSelect.mockImplementation(() => ({ eq: mockPagesSelectEq1 }))
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'nodes': return { upsert: mockNodesUpsert, update: mockNodesUpdate, select: mockNodesSelect }
        case 'edges': return { upsert: mockEdgesUpsert, delete: mockEdgesDelete }
        case 'pages': return { select: mockPagesSelect }
        default: return {}
      }
    })
  })

  describe('upsertNode', () => {
    it('upserts a node and returns its id', async () => {
      const { upsertNode } = await import('@/lib/graph/graph')
      const id = await upsertNode('ws1', 'page', 'entity1')
      expect(mockNodesUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws1', entity_type: 'page', entity_id: 'entity1' }),
        expect.objectContaining({ onConflict: 'entity_type,entity_id' })
      )
      expect(id).toBe('n1')
    })

    it('throws when supabase returns an error', async () => {
      mockNodesUpsertSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
      const { upsertNode } = await import('@/lib/graph/graph')
      await expect(upsertNode('ws1', 'page', 'e1')).rejects.toThrow('DB error')
    })
  })

  describe('scheduleEmbed', () => {
    it('calls embed and updates node embedding on success', async () => {
      const { embed } = await import('@/lib/graph/ollama')
      const { scheduleEmbed } = await import('@/lib/graph/graph')
      await scheduleEmbed('n1', 'hello world')
      expect(embed).toHaveBeenCalledWith('hello world')
      expect(mockNodesUpdate).toHaveBeenCalledWith(expect.objectContaining({ embedding: expect.any(Array) }))
      expect(mockNodesUpdateEq).toHaveBeenCalledWith('id', 'n1')
    })

    it('skips embed and DB update for empty text', async () => {
      const { embed } = await import('@/lib/graph/ollama')
      const { scheduleEmbed } = await import('@/lib/graph/graph')
      await scheduleEmbed('n1', '   ')
      expect(embed).not.toHaveBeenCalled()
      expect(mockNodesUpdate).not.toHaveBeenCalled()
    })

    it('retries when DB update returns an error', async () => {
      vi.useFakeTimers()
      mockNodesUpdateEq.mockResolvedValue({ error: { message: 'write failed' } })
      const { scheduleEmbed } = await import('@/lib/graph/graph')
      const p = scheduleEmbed('n1', 'text')
      await vi.runAllTimersAsync()
      await p
      expect(mockNodesUpdateEq).toHaveBeenCalledTimes(3)
      vi.useRealTimers()
    })

    it('retries 3 times then gives up without throwing', async () => {
      vi.useFakeTimers()
      const { embed } = await import('@/lib/graph/ollama')
      vi.mocked(embed).mockRejectedValue(new Error('Ollama down'))
      const { scheduleEmbed } = await import('@/lib/graph/graph')
      const p = scheduleEmbed('n1', 'text')
      await vi.runAllTimersAsync()
      await p
      expect(embed).toHaveBeenCalledTimes(3)
      expect(mockNodesUpdateEq).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('upsertEdge', () => {
    it('upserts an edge with ignoreDuplicates', async () => {
      const { upsertEdge } = await import('@/lib/graph/graph')
      await upsertEdge('ws1', 'n-source', 'n-target', 'parent_child')
      expect(mockEdgesUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws1',
          source_node_id: 'n-source',
          target_node_id: 'n-target',
          relationship_type: 'parent_child',
        }),
        expect.objectContaining({ ignoreDuplicates: true })
      )
    })
  })

  describe('clearMentionEdges', () => {
    it('deletes mention edges from source and backlink edges to target', async () => {
      const { clearMentionEdges } = await import('@/lib/graph/graph')
      await clearMentionEdges('n1')
      expect(mockEdgesDelete).toHaveBeenCalledTimes(2)
      expect(mockEdgesDeleteEq1).toHaveBeenCalledWith('source_node_id', 'n1')
      expect(mockEdgesDeleteEq1).toHaveBeenCalledWith('target_node_id', 'n1')
    })
  })

  describe('findNodeId', () => {
    it('returns null when node not found', async () => {
      mockNodesMaybeSingle.mockResolvedValue({ data: null, error: null })
      const { findNodeId } = await import('@/lib/graph/graph')
      expect(await findNodeId('page', 'e1')).toBeNull()
    })

    it('returns the node id when found', async () => {
      mockNodesMaybeSingle.mockResolvedValue({ data: { id: 'n42' }, error: null })
      const { findNodeId } = await import('@/lib/graph/graph')
      expect(await findNodeId('page', 'e1')).toBe('n42')
    })
  })

  describe('findPageNodeByTitle', () => {
    it('returns null when no page with that title exists', async () => {
      mockPagesMaybeSingle.mockResolvedValue({ data: null, error: null })
      const { findPageNodeByTitle } = await import('@/lib/graph/graph')
      expect(await findPageNodeByTitle('ws1', 'Missing Page')).toBeNull()
    })

    it('returns the node id when page and node both exist', async () => {
      mockPagesMaybeSingle.mockResolvedValue({ data: { id: 'p99' }, error: null })
      mockNodesMaybeSingle.mockResolvedValue({ data: { id: 'n99' }, error: null })
      const { findPageNodeByTitle } = await import('@/lib/graph/graph')
      expect(await findPageNodeByTitle('ws1', 'My Page')).toBe('n99')
    })
  })
})
