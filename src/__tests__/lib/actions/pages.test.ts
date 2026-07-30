import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()

const mockFrom = vi.fn(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
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
  })

  it('createPage inserts a page and returns it', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'p1', title: 'Untitled', workspace_id: 'ws1', parent_id: null, created_by: 'u1', created_at: '', updated_at: '' }, error: null })
    const { createPage } = await import('@/lib/actions/pages')
    const result = await createPage('ws1', null)
    expect(mockFrom).toHaveBeenCalledWith('pages')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'ws1', created_by: 'u1' }))
    expect(result.id).toBe('p1')
  })

  it('updatePageTitle updates title and revalidates', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'p1', title: 'New Title' }, error: null })
    const { revalidatePath } = await import('next/cache')
    const { updatePageTitle } = await import('@/lib/actions/pages')
    await updatePageTitle('p1', 'ws1', 'New Title')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Title' }))
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('deletePage deletes and revalidates', async () => {
    mockEq.mockResolvedValue({ error: null })
    const { revalidatePath } = await import('next/cache')
    const { deletePage } = await import('@/lib/actions/pages')
    await deletePage('p1', 'ws1')
    expect(mockDelete).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('getPages returns pages ordered by created_at', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'p1', title: 'A' }], error: null })
    const { getPages } = await import('@/lib/actions/pages')
    const pages = await getPages('ws1')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(pages).toHaveLength(1)
  })
})
