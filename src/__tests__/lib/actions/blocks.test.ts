import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TiptapDocument } from '@/lib/types/database'

const mockDelete = vi.fn(() => ({
  eq: vi.fn().mockResolvedValue({ error: null }),
}))

const mockOrder = vi.fn().mockResolvedValue({
  data: [],
  error: null,
})

const mockEq = vi.fn(() => ({
  order: mockOrder,
}))

const mockSelect = vi.fn(() => ({
  eq: mockEq,
}))

const mockUpsert = vi.fn().mockResolvedValue({ error: null })

const mockFrom = vi.fn((table: string) => {
  if (table === 'blocks') {
    return {
      delete: mockDelete,
      upsert: mockUpsert,
      select: mockSelect,
    }
  }
  return {}
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockDoc: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
}

describe('block actions', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules() })

  it('saveBlocks deletes existing blocks then upserts new ones', async () => {
    const { saveBlocks } = await import('@/lib/actions/pages')
    await saveBlocks('page1', 'ws1', mockDoc)
    expect(mockFrom).toHaveBeenCalledWith('blocks')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalled()
  })

  it('loadBlocks returns a TiptapDocument reconstructed from blocks', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: 'b1', type: 'paragraph', content: { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }, position: 0 },
      ],
      error: null,
    })
    const { loadBlocks } = await import('@/lib/actions/pages')
    const doc = await loadBlocks('page1')
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(1)
  })
})
