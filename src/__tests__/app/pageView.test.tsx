import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { loadBlocks } from '@/lib/actions/pages'
import { getFileRecord, getSignedReadUrl } from '@/lib/actions/files'

class NotFoundError extends Error {}

const mockFrom = vi.fn()

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new NotFoundError('NEXT_NOT_FOUND') }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))

vi.mock('@/lib/actions/pages', () => ({
  loadBlocks: vi.fn(),
}))

vi.mock('@/lib/actions/files', () => ({
  getFileRecord: vi.fn(),
  getSignedReadUrl: vi.fn(),
}))

vi.mock('@/components/editor/PageEditor', () => ({
  PageEditor: (props: { initialTitle: string; workspaceName?: string; fileAttachments?: unknown[] }) => (
    <div data-testid="page-editor-stub">
      title:{props.initialTitle} ws:{props.workspaceName} attachments:{props.fileAttachments?.length ?? 0}
    </div>
  ),
}))

vi.mock('@/components/database/PropertiesPanel', () => ({
  PropertiesPanel: (props: { rowId: string; databaseId: string }) => (
    <div data-testid="properties-panel-stub">row:{props.rowId} db:{props.databaseId}</div>
  ),
}))

vi.mock('@/components/files/FilePage', () => ({
  FilePage: (props: { signedUrl: string }) => (
    <div data-testid="file-page-stub">url:{props.signedUrl}</div>
  ),
}))

vi.mock('@/components/editor/DocProcessing', () => ({
  DocProcessing: (props: { fileRecord: { extraction_status: string } }) => (
    <div data-testid="doc-processing-stub">{props.fileRecord.extraction_status}</div>
  ),
}))

function makeChain(data: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data })),
    in: vi.fn(() => Promise.resolve({ data })),
    maybeSingle: vi.fn(() => Promise.resolve({ data })),
    single: vi.fn(() => Promise.resolve({ data })),
  }
  return chain
}

const pageData = { id: 'page-1', title: 'My Page', workspace_id: 'ws-1' }
const wsData = { name: 'My Workspace' }

async function renderPage() {
  const mod = await import('@/app/(app)/workspace/[workspaceId]/page/[pageId]/page')
  const PageViewPage = mod.default
  const element = await PageViewPage({ params: Promise.resolve({ workspaceId: 'ws-1', pageId: 'page-1' }) })
  return render(element)
}

describe('PageViewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockFrom.mockReset()
    vi.mocked(loadBlocks).mockResolvedValue({ type: 'doc', content: [] })
    vi.mocked(getFileRecord).mockResolvedValue(null)
  })

  it('calls notFound when the page does not exist in this workspace', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(null))      // pages
      .mockReturnValueOnce(makeChain(wsData))    // workspaces
      .mockReturnValueOnce(makeChain(null))      // database_rows

    await expect(renderPage()).rejects.toThrow(NotFoundError)
  })

  it('renders FilePage and skips block loading when the page is a plain file attachment (no database row)', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))
      .mockReturnValueOnce(makeChain(wsData))
      .mockReturnValueOnce(makeChain(null)) // database_rows
    vi.mocked(getFileRecord).mockResolvedValue({
      id: 'file-1', workspace_id: 'ws-1', page_id: 'page-1',
      storage_path: 'a/b.pdf', mime_type: 'application/pdf',
      extracted_text: null, extraction_status: 'done', created_at: '',
    })
    vi.mocked(getSignedReadUrl).mockResolvedValue({ url: 'https://signed.example/file' })

    await renderPage()

    expect(screen.getByTestId('file-page-stub')).toHaveTextContent('url:https://signed.example/file')
    expect(loadBlocks).not.toHaveBeenCalled()
  })

  it('renders the editor with no properties panel for a regular page with no attachments', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))   // pages (lookup)
      .mockReturnValueOnce(makeChain(wsData))      // workspaces
      .mockReturnValueOnce(makeChain(null))        // database_rows
      .mockReturnValueOnce(makeChain([]))          // pages (children)

    await renderPage()

    const editor = screen.getByTestId('page-editor-stub')
    expect(editor).toHaveTextContent('title:My Page')
    expect(editor).toHaveTextContent('ws:My Workspace')
    expect(editor).toHaveTextContent('attachments:0')
    expect(screen.queryByTestId('properties-panel-stub')).not.toBeInTheDocument()
  })

  it('builds the attachment list from child pages that are files, excluding non-file children', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))
      .mockReturnValueOnce(makeChain(wsData))
      .mockReturnValueOnce(makeChain(null)) // database_rows
      .mockReturnValueOnce(makeChain([{ id: 'child-1', title: 'notes.pdf' }, { id: 'child-2', title: 'Not a file' }])) // children
      .mockReturnValueOnce(makeChain([{ page_id: 'child-1' }])) // files

    await renderPage()

    expect(screen.getByTestId('page-editor-stub')).toHaveTextContent('attachments:1')
  })

  it('renders both the editor and a properties panel when the page is a database row with a resolved schema', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))
      .mockReturnValueOnce(makeChain(wsData))
      .mockReturnValueOnce(makeChain({ id: 'row-1', database_id: 'db-1', fields: { status: 'Done' } })) // database_rows
      .mockReturnValueOnce(makeChain({ schema: [{ id: 'f1', name: 'Status', type: 'text' }] })) // databases
      .mockReturnValueOnce(makeChain([])) // children

    await renderPage()

    expect(screen.getByTestId('page-editor-stub')).toBeInTheDocument()
    const panel = screen.getByTestId('properties-panel-stub')
    expect(panel).toHaveTextContent('row:row-1')
    expect(panel).toHaveTextContent('db:db-1')
  })

  it('omits the properties panel when the row exists but its schema cannot be resolved', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))
      .mockReturnValueOnce(makeChain(wsData))
      .mockReturnValueOnce(makeChain({ id: 'row-1', database_id: 'db-1', fields: {} })) // database_rows
      .mockReturnValueOnce(makeChain(null)) // databases (missing)
      .mockReturnValueOnce(makeChain([])) // children

    await renderPage()

    expect(screen.getByTestId('page-editor-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('properties-panel-stub')).not.toBeInTheDocument()
  })

  it('renders DocProcessing for a pending database-doc page', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))
      .mockReturnValueOnce(makeChain(wsData))
      .mockReturnValueOnce(makeChain({ id: 'row-1', database_id: 'db-1', fields: {} })) // database_rows
    vi.mocked(getFileRecord).mockResolvedValue({
      id: 'file-1', workspace_id: 'ws-1', page_id: 'page-1',
      storage_path: 'ws-1/page-1/notes.pdf', mime_type: 'application/pdf',
      extracted_text: null, extraction_status: 'pending', created_at: '',
    })

    await renderPage()

    expect(screen.getByTestId('doc-processing-stub')).toHaveTextContent('pending')
    expect(loadBlocks).not.toHaveBeenCalled()
  })

  it('renders DocProcessing for an errored database-doc page', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))
      .mockReturnValueOnce(makeChain(wsData))
      .mockReturnValueOnce(makeChain({ id: 'row-1', database_id: 'db-1', fields: {} })) // database_rows
    vi.mocked(getFileRecord).mockResolvedValue({
      id: 'file-1', workspace_id: 'ws-1', page_id: 'page-1',
      storage_path: 'ws-1/page-1/notes.pdf', mime_type: 'application/pdf',
      extracted_text: null, extraction_status: 'error', created_at: '',
    })

    await renderPage()

    expect(screen.getByTestId('doc-processing-stub')).toHaveTextContent('error')
  })

  it('falls through to the normal editor once a database-doc page finishes parsing', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain(pageData))
      .mockReturnValueOnce(makeChain(wsData))
      .mockReturnValueOnce(makeChain({ id: 'row-1', database_id: 'db-1', fields: {} })) // database_rows
      .mockReturnValueOnce(makeChain({ schema: [] })) // databases
      .mockReturnValueOnce(makeChain([]))   // pages (children)
    vi.mocked(getFileRecord).mockResolvedValue({
      id: 'file-1', workspace_id: 'ws-1', page_id: 'page-1',
      storage_path: 'ws-1/page-1/notes.pdf', mime_type: 'application/pdf',
      extracted_text: null, extraction_status: 'done', created_at: '',
    })

    await renderPage()

    expect(screen.getByTestId('page-editor-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('doc-processing-stub')).not.toBeInTheDocument()
    expect(screen.queryByTestId('file-page-stub')).not.toBeInTheDocument()
    expect(loadBlocks).toHaveBeenCalled()
  })
})
