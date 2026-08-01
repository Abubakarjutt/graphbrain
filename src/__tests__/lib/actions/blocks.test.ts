import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TiptapDocument } from '@/lib/types/database'

// blocks table mocks
const mockBlocksDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockBlocksDelete = vi.fn(() => ({ eq: mockBlocksDeleteEq }))
const mockBlocksInsert = vi.fn().mockResolvedValue({ error: null })
const mockBlocksOrderEq = vi.fn()
const mockBlocksSelectEq = vi.fn(() => ({ order: mockBlocksOrderEq }))
const mockBlocksSelect = vi.fn(() => ({ eq: mockBlocksSelectEq }))

// pages table mocks (for ownership check)
const mockPagesSingle = vi.fn()
const mockPagesSelectEq2 = vi.fn(() => ({ single: mockPagesSingle }))
const mockPagesSelectEq1 = vi.fn(() => ({ eq: mockPagesSelectEq2 }))
const mockPagesSelect = vi.fn(() => ({ eq: mockPagesSelectEq1 }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'blocks') {
    return { delete: mockBlocksDelete, insert: mockBlocksInsert, select: mockBlocksSelect }
  }
  if (table === 'pages') {
    return { select: mockPagesSelect }
  }
  return {}
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/graph/graph', () => ({
  upsertNode: vi.fn().mockResolvedValue('n1'),
  scheduleEmbed: vi.fn().mockResolvedValue(undefined),
  upsertEdge: vi.fn().mockResolvedValue(undefined),
  findNodeId: vi.fn().mockResolvedValue(null),
  findPageNodeByTitle: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/graph/content', () => ({
  pageToText: vi.fn().mockReturnValue('page text'),
  parseMentions: vi.fn().mockReturnValue([]),
}))

const mockDoc: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
}

describe('block actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // Re-wire mocks that clearAllMocks resets
    mockBlocksDeleteEq.mockResolvedValue({ error: null })
    mockBlocksDelete.mockImplementation(() => ({ eq: mockBlocksDeleteEq }))
    mockBlocksInsert.mockResolvedValue({ error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'page1' }, error: null })
    mockBlocksSelectEq.mockImplementation(() => ({ order: mockBlocksOrderEq }))
    mockBlocksSelect.mockImplementation(() => ({ eq: mockBlocksSelectEq }))
    mockPagesSelectEq2.mockImplementation(() => ({ single: mockPagesSingle }))
    mockPagesSelectEq1.mockImplementation(() => ({ eq: mockPagesSelectEq2 }))
    mockPagesSelect.mockImplementation(() => ({ eq: mockPagesSelectEq1 }))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'blocks') return { delete: mockBlocksDelete, insert: mockBlocksInsert, select: mockBlocksSelect }
      if (table === 'pages') return { select: mockPagesSelect }
      return {}
    })
  })

  it('saveBlocks verifies page ownership then deletes and inserts blocks', async () => {
    const { saveBlocks } = await import('@/lib/actions/pages')
    await saveBlocks('page1', 'ws1', mockDoc, 'My Page')

    // Ownership check: pages table queried with correct filters
    expect(mockFrom).toHaveBeenCalledWith('pages')
    expect(mockPagesSelectEq1).toHaveBeenCalledWith('id', 'page1')
    expect(mockPagesSelectEq2).toHaveBeenCalledWith('workspace_id', 'ws1')

    // Block delete filtered by page_id
    expect(mockFrom).toHaveBeenCalledWith('blocks')
    expect(mockBlocksDelete).toHaveBeenCalled()
    expect(mockBlocksDeleteEq).toHaveBeenCalledWith('page_id', 'page1')

    // Insert (not upsert) called with block rows
    expect(mockBlocksInsert).toHaveBeenCalled()
  })

  it('saveBlocks throws when page ownership check fails', async () => {
    mockPagesSingle.mockResolvedValue({ data: null, error: null })
    const { saveBlocks } = await import('@/lib/actions/pages')
    await expect(saveBlocks('other-page', 'ws1', mockDoc, 'My Page')).rejects.toThrow('Page not found or access denied')
    expect(mockBlocksDelete).not.toHaveBeenCalled()
  })

  it('loadBlocks returns a TiptapDocument reconstructed from blocks', async () => {
    mockBlocksOrderEq.mockResolvedValue({
      data: [
        { id: 'b1', type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }, position: 0 },
      ],
      error: null,
    })
    const { loadBlocks } = await import('@/lib/actions/pages')
    const doc = await loadBlocks('page1', 'ws1')
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(1)
  })

  it('saveBlocks + loadBlocks round-trips a doc with Tiptap node names unchanged', async () => {
    // The doc uses real Tiptap node names that previously violated blocks_type_check.
    const tiptapDoc: TiptapDocument = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Todo item' }] }] }] },
        { type: 'callout', attrs: { type: 'info' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
      ],
    }

    // Capture what saveBlocks inserts so we can feed it back through loadBlocks.
    let capturedRows: Array<{ page_id: string; type: string; content: unknown; position: number }> = []
    mockBlocksInsert.mockImplementation((rows) => {
      capturedRows = rows
      return Promise.resolve({ error: null })
    })

    const { saveBlocks, loadBlocks } = await import('@/lib/actions/pages')
    await saveBlocks('page1', 'ws1', tiptapDoc, 'My Page')

    // Verify each inserted row preserves the original Tiptap node name as `type`.
    expect(capturedRows).toHaveLength(4)
    expect(capturedRows[0].type).toBe('paragraph')
    expect(capturedRows[1].type).toBe('heading')
    expect(capturedRows[2].type).toBe('taskList')
    expect(capturedRows[3].type).toBe('callout')

    // Now simulate loadBlocks returning the same rows in position order.
    const dbRows = capturedRows.map((r, i) => ({
      id: `b${i}`,
      type: r.type,
      content: r.content,
      position: r.position,
    }))
    mockBlocksOrderEq.mockResolvedValue({ data: dbRows, error: null })

    const loaded = await loadBlocks('page1', 'ws1')
    expect(loaded.type).toBe('doc')
    expect(loaded.content).toHaveLength(4)

    // loadBlocks returns b.content for each row; each content is the original TiptapNode.
    const types = loaded.content!.map((n) => n.type)
    expect(types).toEqual(['paragraph', 'heading', 'taskList', 'callout'])
  })
})
