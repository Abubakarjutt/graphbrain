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
const mockPagesTitleSingle = vi.fn()
const mockPagesContainerEq2 = vi.fn(() => ({ single: mockPagesContainerSingle }))
const mockPagesContainerEq1 = vi.fn(() => ({ eq: mockPagesContainerEq2, single: mockPagesTitleSingle }))
const mockPagesContainerSelect = vi.fn(() => ({ eq: mockPagesContainerEq1 }))

// ── blocks table ──────────────────────────────────────────────────
const mockBlocksDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockBlocksDelete = vi.fn(() => ({ eq: mockBlocksDeleteEq }))
const mockBlocksInsert = vi.fn().mockResolvedValue({ error: null })

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
    case 'blocks': return { delete: mockBlocksDelete, insert: mockBlocksInsert }
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
vi.mock('@/lib/parsing/textToMarkdown', () => ({ textToMarkdown: vi.fn() }))
vi.mock('@/lib/parsing/docxToMarkdown', () => ({ docxToMarkdown: vi.fn() }))
vi.mock('@/lib/parsing/pdfToMarkdown', () => ({ pdfToMarkdown: vi.fn() }))
vi.mock('@/lib/parsing/markdownToBlocks', () => ({
  markdownToBlocks: vi.fn().mockReturnValue({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
  }),
}))

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
    mockPagesTitleSingle.mockResolvedValue({ data: { title: 'Untitled' }, error: null })
    mockPagesContainerEq2.mockImplementation(() => ({ single: mockPagesContainerSingle }))
    mockPagesContainerEq1.mockImplementation(() => ({ eq: mockPagesContainerEq2, single: mockPagesTitleSingle }))
    mockPagesContainerSelect.mockImplementation(() => ({ eq: mockPagesContainerEq1 }))
    mockBlocksDeleteEq.mockResolvedValue({ error: null })
    mockBlocksDelete.mockImplementation(() => ({ eq: mockBlocksDeleteEq }))
    mockBlocksInsert.mockResolvedValue({ error: null })
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
        case 'blocks': return { delete: mockBlocksDelete, insert: mockBlocksInsert }
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
    // the bytes are already uploaded by the time this runs — clean them up, don't orphan them
    expect(mockStorageRemove).toHaveBeenCalledWith(['ws1/p1/photo.jpg'])
  })

  it('createDatabaseDocPage rejects an unsupported mime type without removing a path outside the reserved prefix', async () => {
    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await expect(
      createDatabaseDocPage('ws1', 'db1', 'photo.jpg', 'ws2/other/photo.jpg', 'image/jpeg', 'p1')
    ).rejects.toThrow('Invalid storage path')
    expect(mockStorageRemove).not.toHaveBeenCalled()
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

  it('runDocParse (via createDatabaseDocPage -> after()) parses txt, saves blocks, marks done', async () => {
    const { after } = await import('next/server')
    const { textToMarkdown } = await import('@/lib/parsing/textToMarkdown')
    vi.mocked(textToMarkdown).mockReturnValue('# hello')
    mockFilesInsertSingle.mockResolvedValue({ data: { id: 'f1' }, error: null })

    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await createDatabaseDocPage('ws1', 'db1', 'notes.txt', 'ws1/p1/notes.txt', 'text/plain', 'p1')

    // after() callbacks are captured but not auto-run by the mock; invoke them to simulate the background task
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(mockBlocksDelete).toHaveBeenCalled()
    expect(mockBlocksInsert).toHaveBeenCalledWith([
      expect.objectContaining({ page_id: 'p1', type: 'paragraph', position: 0 }),
    ])
    expect(mockFilesUpdateEq).toHaveBeenCalledWith('id', 'f1')
  })

  it('runDocParse sets extraction_status to error and leaves blocks untouched when parsing throws', async () => {
    const { after } = await import('next/server')
    const { textToMarkdown } = await import('@/lib/parsing/textToMarkdown')
    vi.mocked(textToMarkdown).mockImplementation(() => { throw new Error('bad text') })
    mockFilesInsertSingle.mockResolvedValue({ data: { id: 'f1' }, error: null })

    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await createDatabaseDocPage('ws1', 'db1', 'notes.txt', 'ws1/p1/notes.txt', 'text/plain', 'p1')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(mockBlocksInsert).not.toHaveBeenCalled()
    expect(mockFilesUpdate).toHaveBeenCalledWith({ extraction_status: 'error' })
  })

  it('runDocParse marks the file error when the parser yields no text (e.g. a scanned PDF)', async () => {
    const { after } = await import('next/server')
    const { textToMarkdown } = await import('@/lib/parsing/textToMarkdown')
    const { markdownToBlocks } = await import('@/lib/parsing/markdownToBlocks')
    vi.mocked(textToMarkdown).mockReturnValue('   \n\n  ')
    mockFilesInsertSingle.mockResolvedValue({ data: { id: 'f1' }, error: null })

    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await createDatabaseDocPage('ws1', 'db1', 'scan.txt', 'ws1/p1/scan.txt', 'text/plain', 'p1')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(markdownToBlocks).not.toHaveBeenCalled()
    expect(mockBlocksDelete).not.toHaveBeenCalled()
    expect(mockBlocksInsert).not.toHaveBeenCalled()
    expect(mockFilesUpdate).toHaveBeenCalledWith({ extraction_status: 'error' })
  })

  it('runDocParse backs off without rewriting blocks when a concurrent parse already finished', async () => {
    const { after } = await import('next/server')
    const { textToMarkdown } = await import('@/lib/parsing/textToMarkdown')
    vi.mocked(textToMarkdown).mockReturnValue('# hello')
    mockFilesInsertSingle.mockResolvedValue({ data: { id: 'f1' }, error: null })
    // the pre-write status check finds the file already marked done by the winning invocation
    mockFilesMaybeSingle.mockResolvedValue({ data: { extraction_status: 'done' }, error: null })

    const { createDatabaseDocPage } = await import('@/lib/actions/files')
    await createDatabaseDocPage('ws1', 'db1', 'notes.txt', 'ws1/p1/notes.txt', 'text/plain', 'p1')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(textToMarkdown).toHaveBeenCalled() // parsing still ran normally beforehand
    expect(mockBlocksDelete).not.toHaveBeenCalled()
    expect(mockBlocksInsert).not.toHaveBeenCalled()
    expect(mockFilesUpdate).not.toHaveBeenCalled()
  })

  it('retryDocParse resets status to pending, then re-runs parsing, and returns the pending record', async () => {
    const { after } = await import('next/server')
    mockFilesMaybeSingle.mockResolvedValue({
      data: { id: 'f1', workspace_id: 'ws1', page_id: 'p1', storage_path: 'ws1/p1/notes.txt',
              mime_type: 'text/plain', extracted_text: null, extraction_status: 'error', created_at: '' },
      error: null,
    })

    const { retryDocParse } = await import('@/lib/actions/files')
    const result = await retryDocParse('f1', 'ws1')

    expect(result.id).toBe('f1')
    // the client only polls while pending — the reset is what restarts polling after a retry
    expect(result.extraction_status).toBe('pending')
    expect(mockFilesUpdate).toHaveBeenCalledWith({ extraction_status: 'pending' })
    expect(mockFilesUpdateEq).toHaveBeenCalledWith('id', 'f1')
    expect(mockFilesUpdate.mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(after).mock.invocationCallOrder[0])
  })
})
