import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { FilePage } from '@/components/files/FilePage'
import type { FileRecord } from '@/lib/types/database'

const mockGetFileRecord = vi.fn()
const mockRetryExtraction = vi.fn()

vi.mock('@/lib/actions/files', () => ({
  getFileRecord: (...args: unknown[]) => mockGetFileRecord(...args),
  retryExtraction: (...args: unknown[]) => mockRetryExtraction(...args),
}))

vi.useFakeTimers()

const baseRecord: FileRecord = {
  id: 'f1',
  workspace_id: 'ws1',
  page_id: 'p1',
  storage_path: 'ws1/p1/photo.jpg',
  mime_type: 'image/jpeg',
  extracted_text: null,
  extraction_status: 'none',
  created_at: '',
}

describe('FilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an img tag for image MIME types', () => {
    render(<FilePage fileRecord={baseRecord} signedUrl="https://cdn/photo.jpg" workspaceId="ws1" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn/photo.jpg')
  })

  it('renders an iframe for PDF MIME type', () => {
    const record = { ...baseRecord, mime_type: 'application/pdf', extraction_status: 'none' as const }
    render(<FilePage fileRecord={record} signedUrl="https://cdn/doc.pdf" workspaceId="ws1" />)
    expect(document.querySelector('iframe')).toHaveAttribute('src', 'https://cdn/doc.pdf')
  })

  it('renders extracted text when extraction_status is done', () => {
    const record = { ...baseRecord, mime_type: 'application/pdf', extraction_status: 'done' as const, extracted_text: 'Hello world' }
    render(<FilePage fileRecord={record} signedUrl="https://cdn/doc.pdf" workspaceId="ws1" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders Indexing badge when extraction_status is pending', () => {
    const record = { ...baseRecord, mime_type: 'application/pdf', extraction_status: 'pending' as const }
    render(<FilePage fileRecord={record} signedUrl="https://cdn/doc.pdf" workspaceId="ws1" />)
    expect(screen.getByText('Indexing…')).toBeInTheDocument()
  })

  it('renders extraction failed badge and Retry button when status is error', () => {
    const record = { ...baseRecord, mime_type: 'application/pdf', extraction_status: 'error' as const }
    render(<FilePage fileRecord={record} signedUrl="https://cdn/doc.pdf" workspaceId="ws1" />)
    expect(screen.getByText('Extraction failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows download link for all file types', () => {
    render(<FilePage fileRecord={baseRecord} signedUrl="https://cdn/photo.jpg" workspaceId="ws1" />)
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', 'https://cdn/photo.jpg')
  })

  it('polls getFileRecord until status is done', async () => {
    const pendingRecord = { ...baseRecord, mime_type: 'application/pdf', extraction_status: 'pending' as const }
    const doneRecord = { ...pendingRecord, extraction_status: 'done' as const, extracted_text: 'Extracted!' }
    mockGetFileRecord.mockResolvedValue(doneRecord)

    render(<FilePage fileRecord={pendingRecord} signedUrl="https://cdn/doc.pdf" workspaceId="ws1" />)
    expect(screen.getByText('Indexing…')).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(3000) })
    await act(async () => {})

    expect(mockGetFileRecord).toHaveBeenCalledWith('p1', 'ws1')
    expect(screen.getByText('Extracted!')).toBeInTheDocument()
  })

  it('shows Indexing unavailable after 10 poll attempts', async () => {
    const pendingRecord = { ...baseRecord, mime_type: 'application/pdf', extraction_status: 'pending' as const }
    mockGetFileRecord.mockResolvedValue(pendingRecord)

    render(<FilePage fileRecord={pendingRecord} signedUrl="https://cdn/doc.pdf" workspaceId="ws1" />)

    for (let i = 0; i < 10; i++) {
      await act(async () => { vi.advanceTimersByTime(3000) })
      await act(async () => {})
    }

    expect(screen.getByText('Indexing unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
