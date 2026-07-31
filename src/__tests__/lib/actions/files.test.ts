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
    case 'pages': return { insert: mockPagesInsert, delete: mockPagesDelete }
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
    mockPagesInsertError.mockResolvedValue({ error: null })
    mockPagesInsert.mockImplementation(() => mockPagesInsertError)
    mockPagesDeleteEq.mockResolvedValue({ error: null })
    mockPagesDelete.mockImplementation(() => ({ eq: mockPagesDeleteEq }))
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
        case 'pages': return { insert: mockPagesInsert, delete: mockPagesDelete }
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

  it('getSignedReadUrl returns signed URL', async () => {
    const { getSignedReadUrl } = await import('@/lib/actions/files')
    const result = await getSignedReadUrl('ws1/p1/file.pdf', 'ws1')
    expect(result.url).toBe('https://storage/read')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('ws1/p1/file.pdf', 3600)
  })

  it('getSignedReadUrl throws when user is not a workspace member', async () => {
    mockMemberMaybeSingle.mockResolvedValue({ data: null, error: null })
    const { getSignedReadUrl } = await import('@/lib/actions/files')
    await expect(getSignedReadUrl('ws1/p1/file.pdf', 'ws1')).rejects.toThrow('Access denied')
  })
})
