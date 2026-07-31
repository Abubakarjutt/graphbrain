import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileUploadButton } from '@/components/files/FileUploadButton'

const mockGetUploadUrl = vi.fn()
const mockCreateFilePage = vi.fn()

vi.mock('@/lib/actions/files', () => ({
  getUploadUrl: (...args: unknown[]) => mockGetUploadUrl(...args),
  createFilePage: (...args: unknown[]) => mockCreateFilePage(...args),
}))

// Mock XHR for upload progress
const xhrMock = {
  upload: { onprogress: null as unknown },
  open: vi.fn(),
  setRequestHeader: vi.fn(),
  send: vi.fn(),
  onload: null as unknown,
  onerror: null as unknown,
  status: 200,
}
vi.stubGlobal('XMLHttpRequest', function MockXHR() { return xhrMock })

describe('FileUploadButton', () => {
  const onFileCreated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    xhrMock.status = 200
    xhrMock.send.mockImplementation(() => {
      // Simulate successful XHR upload
      setTimeout(() => (xhrMock.onload as () => void)?.(), 0)
    })
    mockGetUploadUrl.mockResolvedValue({
      signedUrl: 'https://storage/upload',
      storagePath: 'ws1/p1/file.pdf',
      reservedPageId: 'p1',
    })
    mockCreateFilePage.mockResolvedValue({ pageId: 'p1' })
  })

  it('renders the Attach file button', () => {
    render(<FileUploadButton pageId="parent1" workspaceId="ws1" onFileCreated={onFileCreated} />)
    expect(screen.getByText('Attach file')).toBeInTheDocument()
  })

  it('calls getUploadUrl, uploads, then calls createFilePage on file select', async () => {
    render(<FileUploadButton pageId="parent1" workspaceId="ws1" onFileCreated={onFileCreated} />)
    const input = screen.getByLabelText('Upload file')
    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(onFileCreated).toHaveBeenCalledWith('p1', 'report.pdf'))
    expect(mockGetUploadUrl).toHaveBeenCalledWith('report.pdf', 'application/pdf', 'ws1')
    expect(mockCreateFilePage).toHaveBeenCalledWith(
      'ws1', 'parent1', 'report.pdf', 'ws1/p1/file.pdf', 'application/pdf', 'p1'
    )
  })

  it('shows an error message when upload fails', async () => {
    mockGetUploadUrl.mockRejectedValue(new Error('Access denied'))
    render(<FileUploadButton pageId="parent1" workspaceId="ws1" onFileCreated={onFileCreated} />)
    const input = screen.getByLabelText('Upload file')
    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('Access denied')).toBeInTheDocument())
    expect(onFileCreated).not.toHaveBeenCalled()
  })
})
