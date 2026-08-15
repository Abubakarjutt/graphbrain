import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DocUploadButton, effectiveMimeType } from '@/components/database/DocUploadButton'

const mockGetUploadUrl = vi.fn()
const mockCreateDatabaseDocPage = vi.fn()
vi.mock('@/lib/actions/files', () => ({
  getUploadUrl: (...args: unknown[]) => mockGetUploadUrl(...args),
  createDatabaseDocPage: (...args: unknown[]) => mockCreateDatabaseDocPage(...args),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const xhrMock = {
  upload: { onprogress: null as unknown },
  open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(),
  onload: null as unknown, onerror: null as unknown, status: 200,
}
vi.stubGlobal('XMLHttpRequest', function MockXHR() { return xhrMock })

describe('DocUploadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    xhrMock.status = 200
    xhrMock.send.mockImplementation(() => {
      setTimeout(() => (xhrMock.onload as () => void)?.(), 0)
    })
    mockGetUploadUrl.mockResolvedValue({ signedUrl: 'https://storage/upload', storagePath: 'ws1/p1/notes.pdf', reservedPageId: 'p1' })
    mockCreateDatabaseDocPage.mockResolvedValue({ pageId: 'p1' })
  })

  it('renders the Upload document button restricted to doc file types', () => {
    render(<DocUploadButton workspaceId="ws1" databaseId="db1" />)
    expect(screen.getByText('Upload document')).toBeInTheDocument()
    expect(screen.getByLabelText('Upload document')).toHaveAttribute('accept', '.pdf,.docx,.doc,.txt,.md')
  })

  it('uploads, creates the doc page, and navigates to it', async () => {
    render(<DocUploadButton workspaceId="ws1" databaseId="db1" />)
    const input = screen.getByLabelText('Upload document')
    const file = new File(['content'], 'notes.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/workspace/ws1/page/p1'))
    expect(mockGetUploadUrl).toHaveBeenCalledWith('notes.pdf', 'application/pdf', 'ws1')
    expect(mockCreateDatabaseDocPage).toHaveBeenCalledWith('ws1', 'db1', 'notes.pdf', 'ws1/p1/notes.pdf', 'application/pdf', 'p1')
  })

  it('shows an error message when upload fails', async () => {
    mockGetUploadUrl.mockRejectedValue(new Error('Access denied'))
    render(<DocUploadButton workspaceId="ws1" databaseId="db1" />)
    const input = screen.getByLabelText('Upload document')
    const file = new File(['content'], 'notes.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('Access denied')).toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('derives the mime type from the extension when the browser reports none', async () => {
    mockGetUploadUrl.mockResolvedValue({ signedUrl: 'https://storage/upload', storagePath: 'ws1/p1/notes.md', reservedPageId: 'p1' })
    render(<DocUploadButton workspaceId="ws1" databaseId="db1" />)
    const input = screen.getByLabelText('Upload document')
    // browsers commonly report '' for .md, which the server allowlist would reject post-upload
    const file = new File(['# hi'], 'notes.md', { type: '' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockGetUploadUrl).toHaveBeenCalledWith('notes.md', 'text/markdown', 'ws1')
    expect(mockCreateDatabaseDocPage).toHaveBeenCalledWith('ws1', 'db1', 'notes.md', 'ws1/p1/notes.md', 'text/markdown', 'p1')
  })
})

describe('effectiveMimeType', () => {
  it('keeps the browser-reported type when it is an accepted one', () => {
    expect(effectiveMimeType('notes.md', 'application/pdf')).toBe('application/pdf')
  })

  it('maps every accepted extension when the browser reports nothing', () => {
    expect(effectiveMimeType('a.pdf', '')).toBe('application/pdf')
    expect(effectiveMimeType('a.docx', '')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(effectiveMimeType('a.doc', '')).toBe('application/msword')
    expect(effectiveMimeType('a.txt', '')).toBe('text/plain')
    expect(effectiveMimeType('a.MD', '')).toBe('text/markdown')
  })

  it('overrides an unrecognized browser type using the extension', () => {
    expect(effectiveMimeType('notes.md', 'application/octet-stream')).toBe('text/markdown')
  })

  it('leaves unknown extensions alone so the server still rejects them', () => {
    expect(effectiveMimeType('evil.exe', 'application/x-msdownload')).toBe('application/x-msdownload')
    expect(effectiveMimeType('noextension', '')).toBe('')
  })
})
