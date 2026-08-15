import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/graph/graph', () => ({
  upsertNode: vi.fn().mockResolvedValue('n1'),
  scheduleEmbed: vi.fn().mockResolvedValue(undefined),
  upsertEdge: vi.fn().mockResolvedValue(undefined),
  findNodeId: vi.fn().mockResolvedValue(null),
  findPageNodeByTitle: vi.fn().mockResolvedValue(null),
  clearMentionEdges: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/graph/content', () => ({
  pageToText: vi.fn().mockReturnValue('page text'),
  parseMentions: vi.fn().mockReturnValue([]),
}))

// Each function builds its own terminal mock so the chain always resolves correctly.
const mockSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockOrder = vi.fn()

// Chained eq — first call returns builder, subsequent calls can resolve
const mockEq = vi.fn()

// delete returns an object whose eq is the terminal call
const mockDeleteEq2 = vi.fn()
const mockDeleteEq1 = vi.fn(() => ({ eq: mockDeleteEq2 }))
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq1 }))

const mockSelect = vi.fn()

const mockFrom = vi.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete,
  eq: mockEq.mockReturnThis(),
  order: mockOrder,
  single: mockSingle,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('page actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // Reset chained mocks
    mockDeleteEq1.mockImplementation(() => ({ eq: mockDeleteEq2 }))
    mockDeleteEq2.mockResolvedValue({ error: null })
    mockDelete.mockImplementation(() => ({ eq: mockDeleteEq1 }))
    mockSelect.mockReturnThis()
    mockInsert.mockReturnThis()
    mockUpdate.mockReturnThis()
    mockEq.mockReturnThis()
  })

  it('createPage inserts a page and returns it', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Untitled', workspace_id: 'ws1', parent_id: null, created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    const { createPage } = await import('@/lib/actions/pages')
    const result = await createPage('ws1', null)
    expect(mockFrom).toHaveBeenCalledWith('pages')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'ws1', created_by: 'u1' }))
    expect(result.id).toBe('p1')
  })

  it('updatePageTitle updates title and revalidates', async () => {
    mockEq.mockResolvedValue({ error: null })
    const { revalidatePath } = await import('next/cache')
    const { updatePageTitle } = await import('@/lib/actions/pages')
    await updatePageTitle('p1', 'ws1', 'New Title')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Title' }))
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('deletePage deletes with both id and workspace_id filters', async () => {
    const { revalidatePath } = await import('next/cache')
    const { deletePage } = await import('@/lib/actions/pages')
    await deletePage('p1', 'ws1')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteEq1).toHaveBeenCalledWith('id', 'p1')
    expect(mockDeleteEq2).toHaveBeenCalledWith('workspace_id', 'ws1')
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('getPages returns pages ordered by created_at', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'p1', title: 'A' }], error: null })
    const { getPages } = await import('@/lib/actions/pages')
    const pages = await getPages('ws1')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(pages).toHaveLength(1)
  })

  it('createPage sets database_id when a databaseId is passed', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'db1', page_id: 'container1' }, error: null }) // databases lookup
      .mockResolvedValueOnce({ data: { id: 'container1' }, error: null }) // container page lookup — confirms ws1 owns db1
      .mockResolvedValueOnce({ data: { id: 'p1', title: 'Untitled', workspace_id: 'ws1', parent_id: null, database_id: 'db1', created_by: 'u1', created_at: '', updated_at: '' }, error: null }) // the actual page insert
    const { createPage } = await import('@/lib/actions/pages')
    await createPage('ws1', null, 'db1')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: 'ws1', parent_id: null, database_id: 'db1', title: 'Untitled', created_by: 'u1',
    }))
  })

  it('createPage defaults database_id to null when omitted', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'p1', title: 'Untitled', workspace_id: 'ws1', parent_id: null, database_id: null, created_by: 'u1', created_at: '', updated_at: '' }, error: null })
    const { createPage } = await import('@/lib/actions/pages')
    await createPage('ws1', null)
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ database_id: null }))
  })

  it('createPage rejects a databaseId that does not belong to the given workspace', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'db1', page_id: 'container1' }, error: null }) // databases lookup succeeds
      .mockResolvedValueOnce({ data: null, error: null }) // container page query finds nothing in ws1 — db1 belongs elsewhere
    const { createPage } = await import('@/lib/actions/pages')
    await expect(createPage('ws1', null, 'db1')).rejects.toThrow('Database not found or access denied')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
