import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DocProcessing, pollConfigFor } from '@/components/editor/DocProcessing'
import type { FileRecord } from '@/lib/types/database'

const mockGetFileRecord = vi.fn()
const mockRetryDocParse = vi.fn()
const mockGetSignedReadUrl = vi.fn()
vi.mock('@/lib/actions/files', () => ({
  getFileRecord: (...args: unknown[]) => mockGetFileRecord(...args),
  retryDocParse: (...args: unknown[]) => mockRetryDocParse(...args),
  getSignedReadUrl: (...args: unknown[]) => mockGetSignedReadUrl(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.useFakeTimers()

const baseRecord: FileRecord = {
  id: 'f1', workspace_id: 'ws1', page_id: 'p1', storage_path: 'ws1/p1/notes.pdf',
  mime_type: 'application/pdf', extracted_text: null, extraction_status: 'pending', created_at: '',
}

// docx/txt/md parse in-process with no LLM, so they get the short, fail-fast budget
const textRecord: FileRecord = { ...baseRecord, storage_path: 'ws1/p1/notes.txt', mime_type: 'text/plain' }

describe('pollConfigFor', () => {
  it('gives PDFs a multi-minute budget because each chunk goes through the LLM', () => {
    expect(pollConfigFor('application/pdf')).toEqual({ intervalMs: 5000, maxAttempts: 120 })
  })

  it('gives non-PDF types a short budget', () => {
    for (const mime of ['text/plain', 'text/markdown', 'application/msword']) {
      expect(pollConfigFor(mime)).toEqual({ intervalMs: 3000, maxAttempts: 20 })
    }
  })

  it('gives the PDF budget strictly more wall-clock time than the fallback', () => {
    const pdf = pollConfigFor('application/pdf')
    const other = pollConfigFor('text/plain')
    expect(pdf.intervalMs * pdf.maxAttempts).toBeGreaterThan(other.intervalMs * other.maxAttempts)
  })
})

describe('DocProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSignedReadUrl.mockResolvedValue({ url: 'https://storage/read' })
  })

  it('shows a processing message while pending', () => {
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)
    expect(screen.getByText('Processing document…')).toBeInTheDocument()
  })

  it('polls getFileRecord and refreshes the router once done', async () => {
    mockGetFileRecord.mockResolvedValue({ ...baseRecord, extraction_status: 'done' })
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)

    await act(async () => { vi.advanceTimersByTime(5000) })
    await act(async () => {})

    expect(mockGetFileRecord).toHaveBeenCalledWith('p1', 'ws1')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows Retry once the non-PDF poll budget is exhausted', async () => {
    mockGetFileRecord.mockResolvedValue(textRecord)
    render(<DocProcessing fileRecord={textRecord} workspaceId="ws1" />)

    for (let i = 0; i < 20; i++) {
      await act(async () => { vi.advanceTimersByTime(3000) })
      await act(async () => {})
    }

    expect(screen.getByText('Processing unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('keeps waiting on a pending PDF well past the non-PDF budget, then eventually times out', async () => {
    mockGetFileRecord.mockResolvedValue(baseRecord)
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)

    // the old hardcoded budget (10 × 3s) — a real multi-chunk PDF is still parsing here
    for (let i = 0; i < 10; i++) {
      await act(async () => { vi.advanceTimersByTime(3000) })
      await act(async () => {})
    }
    expect(screen.queryByText('Processing unavailable')).not.toBeInTheDocument()
    expect(screen.getByText('Processing document…')).toBeInTheDocument()

    // exhaust the full PDF budget (120 × 5s)
    for (let i = 0; i < 120; i++) {
      await act(async () => { vi.advanceTimersByTime(5000) })
      await act(async () => {})
    }
    expect(screen.getByText('Processing unavailable')).toBeInTheDocument()
  })

  it('shows an error state with Retry when extraction_status is error', () => {
    render(<DocProcessing fileRecord={{ ...baseRecord, extraction_status: 'error' }} workspaceId="ws1" />)
    expect(screen.getByText('Import failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('calls retryDocParse when Retry is clicked from the error state', async () => {
    mockRetryDocParse.mockResolvedValue({ ...baseRecord, extraction_status: 'pending' })
    render(<DocProcessing fileRecord={{ ...baseRecord, extraction_status: 'error' }} workspaceId="ws1" />)

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click()
    })

    expect(mockRetryDocParse).toHaveBeenCalledWith('f1', 'ws1')
    // retryDocParse resets the record to pending, which puts the UI back into polling
    expect(screen.getByText('Processing document…')).toBeInTheDocument()
  })

  it('offers a download link to the original upload while pending', async () => {
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)
    await act(async () => {})

    expect(mockGetSignedReadUrl).toHaveBeenCalledWith('p1', 'ws1')
    expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', 'https://storage/read')
  })

  it('offers the download link in the error state too', async () => {
    render(<DocProcessing fileRecord={{ ...baseRecord, extraction_status: 'error' }} workspaceId="ws1" />)
    await act(async () => {})

    expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', 'https://storage/read')
  })

  it('still renders the processing UI when the download URL cannot be fetched', async () => {
    mockGetSignedReadUrl.mockRejectedValue(new Error('nope'))
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)
    await act(async () => {})

    expect(screen.getByText('Processing document…')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download original' })).not.toBeInTheDocument()
  })
})
