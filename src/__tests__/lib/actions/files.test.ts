import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── workspace_members table ───────────────────────────────────────
const mockMemberMaybeSingle = vi.fn()
const mockMemberEq2 = vi.fn(() => ({ maybeSingle: mockMemberMaybeSingle }))
const mockMemberEq1 = vi.fn(() => ({ eq: mockMemberEq2 }))
const mockMemberSelect = vi.fn(() => ({ eq: mockMemberEq1 }))

// ── pages table ───────────────────────────────────────────────────
const mockPagesInsertError = vi.fn().mockResolvedValue({ error: null })
const mockPagesInsert = vi.fn(() => mockPagesInsertError)
const mockPagesDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockPagesDelete = vi.fn(() => ({ eq: mockPagesDeleteEq }))

// ── pages table: container-page select, separate from insert/delete ──
const mockPagesContainerSingle = vi.fn()
const mockPagesContainerEq2 = vi.fn(() => ({ single: mockPagesContainerSingle }))
const mockPagesContainerEq1 = vi.fn(() => ({ eq: mockPagesContainerEq2 }))
const mockPagesContainerSelect = vi.fn(() => ({ eq: mockPagesContainerEq1 }))

// ── databases table (workspace-ownership check) ────────────────────
const mockDatabasesSingle = vi.fn()
const mockDatabasesEq = vi.fn(() => ({ single: mockDatabasesSingle }))
const mockDatabasesSelect = vi.fn(() => ({ eq: mockDatabasesEq }))

// ── files table ───────────────────────────────────────────────────
const mockFilesInsertSingle = vi.fn()
const mockFilesInsertSelect = vi.fn(() => ({ single: mockFilesInsertSingle }))
const mockFilesInsert = vi.fn(() => ({ select: mockFilesInsertSelect }))
const mockFilesUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockFilesUpdate = vi.fn(() => ({ eq: mockFilesUpdateEq }))
const mockFilesMaybeSingle = vi.fn()
const mockFilesEq2 = vi.fn(() => ({ maybeSingle: mockFilesMaybeSingle, single: mockFilesMaybeSingle }))
const mockFilesEq1 = vi.fn(() => ({ eq: mockFilesEq2 }))
const mockFilesSelect = vi.fn(() => ({ eq: mockFilesEq1 }))

const mockFrom = vi.fn((table: string) => {
  switch (table) {
    case 'workspace_members': return { select: mockMemberSelect }
    case 'databases': return { select: mockDatabasesSelect }
    case 'pages': return { insert: mockPagesInsert, delete: mockPagesDelete, select: mockPagesContainerSelect }
    case 'files': return { insert: mockFilesInsert, update: mockFilesUpdate, select: mockFilesSelect }
    default: return {}
  }
})

// ── Storage mock ──────────────────────────────────────────────────
const mockCreateSignedUploadUrl = vi.fn()
const mockCreateSignedUrl = vi.fn()
const mockStorageRemove = vi.fn().mockResolvedValue({ error: null })
const mockStorageDownload = vi.fn()
const mockStorageFrom = vi.fn(() => ({
  createSignedUploadUrl: mockCreateSignedUploadUrl,
  createSignedUrl: mockCreateSignedUrl,
  remove: mockStorageRemove,
  download: mockStorageDownload,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('pdf-parse', () => ({ PDFParse: vi.fn().mockImplementation(() => ({ getText: vi.fn().mockResolvedValue({ text: '' }) })) }))
vi.mock('mammoth', () => ({ extractRawText: vi.fn() }))

describe('file actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMemberMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null })
    mockDatabasesSingle.mockResolvedValue({ data: { id: 'db1', page_id: 'container1' }, error: null })
    mockDatabasesEq.mockImplementation(() => ({ single: mockDatabasesSingle }))
    mockDatabasesSelect.mockImplementation(() => ({ eq: mockDatabasesEq }))
    mockPagesInsertError.mockResolvedValue({ error: null })
    mockPagesInsert.mockImplementation(() => mockPagesInsertError)
    mockPagesDeleteEq.mockResolvedValue({ error: null })
    mockPagesDelete.mockImplementation(() => ({ eq: mockPagesDeleteEq }))
    mockPagesContainerSingle.mockResolvedValue({ data: { id: 'container1' }, error: null })
    mockPagesContainerEq2.mockImplementation(() => ({ single: mockPagesContainerSingle }))
    mockPagesContainerEq1.mockImplementation(() => ({ eq: mockPagesContainerEq2 }))
    mockPagesContainerSelect.mockImplementation(() => ({ eq: mockPagesContainerEq1 }))
    mockFilesInsertSingle.mockResolvedValue({ data: { id: 'f1' }, error: null })
    mockFilesInsertSelect.mockImplementation(() => ({ single: mockFilesInsertSingle }))
    mockFilesInsert.mockImplementation(() => ({ select: mockFilesInsertSelect }))
    mockFilesUpdateEq.mockResolvedValue({ error: null })
    mockFilesUpdate.mockImplementation(() => ({ eq: mockFilesUpdateEq }))
    mockFilesMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockFilesEq2.mockImplementation(() => ({ maybeSingle: mockFilesMaybeSingle, single: mockFilesMaybeSingle }))
    mockFilesEq1.mockImplementation(() => ({ eq: mockFilesEq2 }))
    mockFilesSelect.mockImplementation(() => ({ eq: mockFilesEq1 }))
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'workspace_members': return { select: mockMemberSelect }
        case 'databases': return { select: mockDatabasesSelect }
        case 'pages': return { insert: mockPagesInsert, delete: mockPagesDelete, select: mockPagesContainerSelect }
        case 'files': return { insert: mockFilesInsert, update: mockFilesUpdate, select: mockFilesSelect }
        default: return {}
      }
    })
    mockCreateSignedUploadUrl.mockResolvedValue({ data: { signedUrl: 'https://storage/upload', path: 'ws1/page1/file.pdf' }, error: null })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage/read' }, error: null })
    mockStorageRemove.mockResolvedValue({ error: null })
    mockStorageDownload.mockResolvedValue({ data: new Blob(['hello']), error: null })
  })

  it('getUploadUrl returns signed URL, storagePath, and reservedPageId', async () => {
    const { getUploadUrl } = await import('@/lib/actions/files')
    const result = await getUploadUrl('report.pdf', 'application/pdf', 'ws1')
    expect(result.signedUrl).toBe('https://storage/upload')
    expect(result.storagePath).toMatch(/^ws1\/.+\/report\.pdf$/)
    expect(result.reservedPageId).toBeTruthy()
  })

  it('getUploadUrl throws when user is not a workspace member', async () => {
    mockMemberMaybeSingle.mockResolvedValue({ data: null, error: null })
    const { getUploadUrl } = await import('@/lib/actions/files')
    await expect(getUploadUrl('file.pdf', 'application/pdf', 'ws1')).rejects.toThrow('Access denied')
  })

  it('createFilePage inserts page and file records', async () => {
    const { createFilePage } = await import('@/lib/actions/files')
    const result = await createFilePage('ws1', 'parent1', 'report.pdf', 'ws1/p1/report.pdf', 'application/pdf', 'p1')
    expect(mockPagesInsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'p1',
      workspace_id: 'ws1',
      parent_id: 'parent1',
      title: 'report.pdf',
    }))
    expect(mockFilesInsert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: 'ws1',
      page_id: 'p1',
      storage_path: 'ws1/p1/report.pdf',
      mime_type: 'application/pdf',
      extraction_status: 'pending',
    }))
    expect(result.pageId).toBe('p1')
  })

  it('createFilePage sets extraction_status to none for images', async () => {
    const { createFilePage } = await import('@/lib/actions/files')
    await createFilePage('ws1', 'parent1', 'photo.jpg', 'ws1/p1/photo.jpg', 'image/jpeg', 'p1')
    expect(mockFilesInsert).toHaveBeenCalledWith(expect.objectContaining({
      extraction_status: 'none',
    }))
  })

  it('createFilePage rolls back page and storage on file insert failure', async () => {
    mockFilesInsertSingle.mockResolvedValue({ data: null, error: { message: 'files insert failed' } })
    const { createFilePage } = await import('@/lib/actions/files')
    await expect(
      createFilePage('ws1', 'parent1', 'report.pdf', 'ws1/p1/report.pdf', 'application/pdf', 'p1')
    ).rejects.toThrow('files insert failed')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p1')
    expect(mockStorageRemove).toHaveBeenCalledWith(['ws1/p1/report.pdf'])
  })

  it('getFileRecord returns null for wrong workspace', async () => {
    const { getFileRecord } = await import('@/lib/actions/files')
    const result = await getFileRecord('p1', 'wrong-ws')
    expect(result).toBeNull()
  })

  it('getFileRecord returns file record when found', async () => {
    mockFilesMaybeSingle.mockResolvedValue({
      data: { id: 'f1', workspace_id: 'ws1', page_id: 'p1', storage_path: 'ws1/p1/file.pdf',
              mime_type: 'application/pdf', extracted_text: null, extraction_status: 'pending', created_at: '' },
      error: null,
    })
    const { getFileRecord } = await import('@/lib/actions/files')
    const result = await getFileRecord('p1', 'ws1')
    expect(result?.id).toBe('f1')
    expect(result?.extraction_status).toBe('pending')
  })

  it('getSignedReadUrl returns signed URL looked up from DB by pageId', async () => {
    mockFilesMaybeSingle.mockResolvedValue({ data: { storage_path: 'ws1/p1/file.pdf' }, error: null })
    const { getSignedReadUrl } = await import('@/lib/actions/files')
    const result = await getSignedReadUrl('p1', 'ws1')
    expect(result.url).toBe('https://storage/read')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('ws1/p1/file.pdf', 3600)
  })

  it('getSignedReadUrl throws when file not found for pageId', async () => {
    mockFilesMaybeSingle.mockResolvedValue({ data: null, error: null })
    const { getSignedReadUrl } = await import('@/lib/actions/files')
    await expect(getSignedReadUrl('p1', 'ws1')).rejects.toThrow('File not found')
  })

  it('getSignedReadUrl throws when user is not a workspace member', async () => {
    mockMemberMaybeSingle.mockResolvedValue({ data: null, error: null })
    const { getSignedReadUrl } = await import('@/lib/actions/files')
    await expect(getSignedReadUrl('p1', 'ws1')).rejects.toThrow('Access denied')
  })

  it('createFilePage throws on invalid storage path prefix', async () => {
    const { createFilePage } = await import('@/lib/actions/files')
    await expect(
      createFilePage('ws1', 'parent1', 'evil.pdf', 'ws2/p1/evil.pdf', 'application/pdf', 'p1')
    ).rejects.toThrow('Invalid storage path')
  })

  it('createDatabaseDocPage inserts a page with database_id set and parent_id null', async () => {
    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    const result = await createDatabaseDocPage('ws1', 'db1', 'notes.pdf', 'ws1/p1/notes.pdf', 'application/pdf', 'p1')
    expect(mockPagesInsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'p1', workspace_id: 'ws1', database_id: 'db1', parent_id: null, title: 'notes.pdf',
    }))
    expect(mockFilesInsert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: 'ws1', page_id: 'p1', storage_path: 'ws1/p1/notes.pdf', mime_type: 'application/pdf', extraction_status: 'pending',
    }))
    expect(result.pageId).toBe('p1')
  })

  it('createDatabaseDocPage rejects unsupported mime types before inserting anything', async () => {
    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await expect(
      createDatabaseDocPage('ws1', 'db1', 'photo.jpg', 'ws1/p1/photo.jpg', 'image/jpeg', 'p1')
    ).rejects.toThrow('Unsupported file type')
    expect(mockPagesInsert).not.toHaveBeenCalled()
  })

  it('createDatabaseDocPage throws on invalid storage path prefix', async () => {
    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await expect(
      createDatabaseDocPage('ws1', 'db1', 'evil.pdf', 'ws2/p1/evil.pdf', 'application/pdf', 'p1')
    ).rejects.toThrow('Invalid storage path')
  })

  it('createDatabaseDocPage rejects a databaseId that does not belong to the given workspace', async () => {
    mockPagesContainerSingle.mockResolvedValue({ data: null, error: null }) // container page query finds nothing in ws1
    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await expect(
      createDatabaseDocPage('ws1', 'db1', 'notes.pdf', 'ws1/p1/notes.pdf', 'application/pdf', 'p1')
    ).rejects.toThrow('Database not found or access denied')
    expect(mockPagesInsert).not.toHaveBeenCalled()
  })

  it('createDatabaseDocPage rolls back the page on file insert failure', async () => {
    mockFilesInsertSingle.mockResolvedValue({ data: null, error: { message: 'files insert failed' } })
    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await expect(
      createDatabaseDocPage('ws1', 'db1', 'notes.pdf', 'ws1/p1/notes.pdf', 'application/pdf', 'p1')
    ).rejects.toThrow('files insert failed')
    expect(mockPagesDeleteEq).toHaveBeenCalledWith('id', 'p1')
    expect(mockStorageRemove).toHaveBeenCalledWith(['ws1/p1/notes.pdf'])
  })
})
