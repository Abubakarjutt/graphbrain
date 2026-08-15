import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/graph/graph', () => ({
  upsertNode: vi.fn().mockResolvedValue('n1'),
  scheduleEmbed: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/graph/content', () => ({
  rowToText: vi.fn().mockReturnValue('field text'),
}))

// ── pages table ──────────────────────────────────────────────────
const mockPagesSingle = vi.fn()
const mockDocsOrder = vi.fn()
const mockPagesSelectEq2 = vi.fn(() => ({ single: mockPagesSingle, order: mockDocsOrder }))
const mockPagesSelectEq1 = vi.fn(() => ({ eq: mockPagesSelectEq2, single: mockPagesSingle }))
const mockPagesIn = vi.fn().mockResolvedValue({ data: [], error: null })
const mockPagesSelectChain = vi.fn(() => ({ eq: mockPagesSelectEq1, in: mockPagesIn }))
const mockPagesInsertSingle = vi.fn()
const mockPagesInsertSelect = vi.fn(() => ({ single: mockPagesInsertSingle }))
const mockPagesInsert = vi.fn(() => ({ select: mockPagesInsertSelect }))
const mockPagesDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockPagesDelete = vi.fn(() => ({ eq: mockPagesDeleteEq }))

// ── databases table ───────────────────────────────────────────────
const mockDbSingle = vi.fn()
const mockDbEq = vi.fn(() => ({ single: mockDbSingle }))
const mockDbSelect = vi.fn(() => ({ eq: mockDbEq }))
const mockDbInsertSingle = vi.fn()
const mockDbInsertSelect = vi.fn(() => ({ single: mockDbInsertSingle }))
const mockDbInsert = vi.fn(() => ({ select: mockDbInsertSelect }))
const mockDbUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockDbUpdate = vi.fn(() => ({ eq: mockDbUpdateEq }))

// ── database_rows table ───────────────────────────────────────────
const mockRowSingle = vi.fn()
const mockRowOrder = vi.fn().mockResolvedValue({ data: [], error: null })
const mockRowSelectEq2 = vi.fn(() => ({ single: mockRowSingle, order: mockRowOrder }))
const mockRowSelectEq1 = vi.fn(() => ({ eq: mockRowSelectEq2, order: mockRowOrder }))
const mockRowSelect = vi.fn(() => ({ eq: mockRowSelectEq1 }))
const mockRowInsertSingle = vi.fn()
const mockRowInsertSelect = vi.fn(() => ({ single: mockRowInsertSingle }))
const mockRowInsert = vi.fn(() => ({ select: mockRowInsertSelect }))
const mockRowUpdateEq2 = vi.fn().mockResolvedValue({ error: null })
const mockRowUpdateEq1 = vi.fn(() => ({ eq: mockRowUpdateEq2 }))
const mockRowUpdate = vi.fn(() => ({ eq: mockRowUpdateEq1 }))
const mockRowDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockRowDelete = vi.fn(() => ({ eq: mockRowDeleteEq }))

const mockFrom = vi.fn((table: string) => {
  switch (table) {
    case 'pages': return { select: mockPagesSelectChain, insert: mockPagesInsert, delete: mockPagesDelete }
    case 'databases': return { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate }
    case 'database_rows': return { select: mockRowSelect, insert: mockRowInsert, update: mockRowUpdate, delete: mockRowDelete }
    default: return {}
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('database actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockPagesDeleteEq.mockResolvedValue({ error: null })
    mockPagesDelete.mockImplementation(() => ({ eq: mockPagesDeleteEq }))
    mockPagesSelectEq2.mockImplementation(() => ({ single: mockPagesSingle, order: mockDocsOrder }))
    mockPagesSelectEq1.mockImplementation(() => ({ eq: mockPagesSelectEq2, single: mockPagesSingle }))
    mockPagesSelectChain.mockImplementation(() => ({ eq: mockPagesSelectEq1, in: mockPagesIn }))
    mockPagesInsertSelect.mockImplementation(() => ({ single: mockPagesInsertSingle }))
    mockPagesInsert.mockImplementation(() => ({ select: mockPagesInsertSelect }))
    mockDbEq.mockImplementation(() => ({ single: mockDbSingle }))
    mockDbSelect.mockImplementation(() => ({ eq: mockDbEq }))
    mockDbInsertSelect.mockImplementation(() => ({ single: mockDbInsertSingle }))
    mockDbInsert.mockImplementation(() => ({ select: mockDbInsertSelect }))
    mockDbUpdateEq.mockResolvedValue({ error: null })
    mockDbUpdate.mockImplementation(() => ({ eq: mockDbUpdateEq }))
    mockRowOrder.mockResolvedValue({ data: [], error: null })
    mockRowSelectEq2.mockImplementation(() => ({ single: mockRowSingle, order: mockRowOrder }))
    mockRowSelectEq1.mockImplementation(() => ({ eq: mockRowSelectEq2, order: mockRowOrder }))
    mockRowSelect.mockImplementation(() => ({ eq: mockRowSelectEq1 }))
    mockRowInsertSelect.mockImplementation(() => ({ single: mockRowInsertSingle }))
    mockRowInsert.mockImplementation(() => ({ select: mockRowInsertSelect }))
    mockRowUpdateEq2.mockResolvedValue({ error: null })
    mockRowUpdateEq1.mockImplementation(() => ({ eq: mockRowUpdateEq2 }))
    mockRowUpdate.mockImplementation(() => ({ eq: mockRowUpdateEq1 }))
    mockRowDeleteEq.mockResolvedValue({ error: null })
    mockRowDelete.mockImplementation(() => ({ eq: mockRowDeleteEq }))
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'pages': return { select: mockPagesSelectChain, insert: mockPagesInsert, delete: mockPagesDelete }
        case 'databases': return { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate }
        case 'database_rows': return { select: mockRowSelect, insert: mockRowInsert, update: mockRowUpdate, delete: mockRowDelete }
        default: return {}
      }
    })
  })

  it('createDatabase creates a page and a database record', async () => {
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Untitled Database', workspace_id: 'ws1', parent_id: null, created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockDbInsertSingle.mockResolvedValue({
      data: { id: 'db1', page_id: 'p1', schema: [], created_at: '' },
      error: null,
    })
    const { createDatabase } = await import('@/lib/actions/databases')
    const result = await createDatabase('ws1')
    expect(mockPagesInsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'ws1', title: 'Untitled Database' }))
    expect(mockDbInsert).toHaveBeenCalledWith(expect.objectContaining({ page_id: 'p1', schema: [] }))
    expect(result.database.id).toBe('db1')
    expect(result.pageId).toBe('p1')
  })

  it('createDatabase rolls back the page if database insert fails', async () => {
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Untitled Database', workspace_id: 'ws1', parent_id: null, created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockDbInsertSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const { createDatabase } = await import('@/lib/actions/databases')
    await expect(createDatabase('ws1')).rejects.toThrow('DB error')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p1')
  })

  it('getDatabase throws when container page is not in the workspace', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p1', schema: [], created_at: '' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: null, error: null })
    const { getDatabase } = await import('@/lib/actions/databases')
    await expect(getDatabase('db1', 'wrong-ws')).rejects.toThrow('Database not found or access denied')
  })

  it('getDatabase returns database with rows and resolved page titles', async () => {
    mockDbSingle.mockResolvedValue({
      data: { id: 'db1', page_id: 'p1', schema: [], created_at: '' },
      error: null,
    })
    mockPagesSingle.mockResolvedValue({
      data: { id: 'p1', workspace_id: 'ws1' },
      error: null,
    })
    mockRowOrder.mockResolvedValue({
      data: [{ id: 'r1', database_id: 'db1', page_id: 'rp1', fields: {}, created_at: '' }],
      error: null,
    })
    mockPagesIn.mockResolvedValue({
      data: [{ id: 'rp1', title: 'My Row Page' }],
      error: null,
    })
    const { getDatabase } = await import('@/lib/actions/databases')
    const result = await getDatabase('db1', 'ws1')
    expect(result.id).toBe('db1')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].page_title).toBe('My Row Page')
  })

  it('createRow atomically creates a page and a database row', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p-row', title: 'Untitled', workspace_id: 'ws1', parent_id: 'p-container', created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockRowInsertSingle.mockResolvedValue({
      data: { id: 'row1', database_id: 'db1', page_id: 'p-row', fields: {}, created_at: '' },
      error: null,
    })
    const { createRow } = await import('@/lib/actions/databases')
    const row = await createRow('db1', 'ws1')
    expect(mockPagesInsert).toHaveBeenCalledWith(expect.objectContaining({ parent_id: 'p-container', workspace_id: 'ws1' }))
    expect(mockRowInsert).toHaveBeenCalledWith(expect.objectContaining({ database_id: 'db1', page_id: 'p-row' }))
    expect(row.id).toBe('row1')
    expect(row.page_id).toBe('p-row')
    expect(row.page_title).toBe('Untitled')
  })

  it('createRow rolls back the page if row insert fails', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    mockPagesInsertSingle.mockResolvedValue({
      data: { id: 'p-row', title: 'Untitled', workspace_id: 'ws1', parent_id: 'p-container', created_by: 'u1', created_at: '', updated_at: '' },
      error: null,
    })
    mockRowInsertSingle.mockResolvedValue({ data: null, error: { message: 'Row error' } })
    const { createRow } = await import('@/lib/actions/databases')
    await expect(createRow('db1', 'ws1')).rejects.toThrow('Row error')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p-row')
  })

  it('updateRowFields updates fields with correct row and database IDs', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    const { updateRowFields } = await import('@/lib/actions/databases')
    await updateRowFields('row1', 'db1', 'ws1', { fieldA: 'value' })
    expect(mockRowUpdate).toHaveBeenCalledWith({ fields: { fieldA: 'value' } })
    expect(mockRowUpdateEq1).toHaveBeenCalledWith('id', 'row1')
    expect(mockRowUpdateEq2).toHaveBeenCalledWith('database_id', 'db1')
  })

  it('deleteRow deletes the row then its linked page', async () => {
    const callOrder: string[] = []
    mockRowDeleteEq.mockImplementation((...args: unknown[]) => {
      callOrder.push('rowDelete')
      return Promise.resolve({ error: null })
    })
    mockPagesDeleteEq.mockImplementation((...args: unknown[]) => {
      callOrder.push('pageDelete')
      return Promise.resolve({ error: null })
    })
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    mockRowSingle.mockResolvedValue({ data: { id: 'row1', page_id: 'p-row' }, error: null })
    const { deleteRow } = await import('@/lib/actions/databases')
    await deleteRow('row1', 'db1', 'ws1')
    expect(mockRowDeleteEq).toHaveBeenCalledWith('id', 'row1')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p-row')
    expect(callOrder).toEqual(['rowDelete', 'pageDelete'])
  })

  it('updateDatabaseSchema updates schema fields', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    const newSchema = [{ id: 'f1', name: 'Title', type: 'text' as const }]
    const { updateDatabaseSchema } = await import('@/lib/actions/databases')
    await updateDatabaseSchema('db1', 'ws1', newSchema)
    expect(mockDbUpdate).toHaveBeenCalledWith({ schema: newSchema })
    expect(mockDbUpdateEq).toHaveBeenCalledWith('id', 'db1')
  })

  it('deleteRow throws when linked page delete fails after row is deleted', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p-container' }, error: null })
    mockRowSingle.mockResolvedValue({ data: { id: 'row1', page_id: 'p-row' }, error: null })
    mockPagesDeleteEq.mockResolvedValue({ error: { message: 'page delete failed' } })
    const { deleteRow } = await import('@/lib/actions/databases')
    await expect(deleteRow('row1', 'db1', 'ws1')).rejects.toThrow('Row deleted but failed to delete linked page: page delete failed')
  })

  it('getDatabase returns Untitled page_title when row page is absent from the titles map', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p1', schema: [], created_at: '' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'p1', workspace_id: 'ws1' }, error: null })
    mockRowOrder.mockResolvedValue({
      data: [{ id: 'r1', database_id: 'db1', page_id: 'missing-page', fields: {}, created_at: '' }],
      error: null,
    })
    mockPagesIn.mockResolvedValue({ data: [], error: null })
    const { getDatabase } = await import('@/lib/actions/databases')
    const result = await getDatabase('db1', 'ws1')
    expect(result.rows[0].page_title).toBe('Untitled')
  })

  it('updateDatabaseSchema throws when database not in workspace', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'p-container' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: null, error: null })
    const { updateDatabaseSchema } = await import('@/lib/actions/databases')
    await expect(updateDatabaseSchema('db1', 'wrong-ws', [])).rejects.toThrow('Database not found or access denied')
  })

  it('getDatabaseDocs returns pages scoped to the database, ordered by created_at', async () => {
    mockDbSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'container1' }, error: null })
    mockPagesSingle.mockResolvedValue({ data: { id: 'container1' }, error: null })
    mockDocsOrder.mockResolvedValue({
      data: [{ id: 'doc1', workspace_id: 'ws1', parent_id: null, database_id: 'db1', title: 'Doc One', created_by: 'u1', created_at: '', updated_at: '' }],
      error: null,
    })

    const { getDatabaseDocs } = await import('@/lib/actions/databases')
    const docs = await getDatabaseDocs('db1', 'ws1')

    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('doc1')
  })

  it('getDatabaseDocs throws when the database is not found', async () => {
    mockDbSingle.mockResolvedValue({ data: null, error: null })
    const { getDatabaseDocs } = await import('@/lib/actions/databases')
    await expect(getDatabaseDocs('missing', 'ws1')).rejects.toThrow('Database not found or access denied')
  })
})
