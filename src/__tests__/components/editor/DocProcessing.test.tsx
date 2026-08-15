import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DocProcessing } from '@/components/editor/DocProcessing'
import type { FileRecord } from '@/lib/types/database'

const mockGetFileRecord = vi.fn()
const mockRetryDocParse = vi.fn()
vi.mock('@/lib/actions/files', () => ({
  getFileRecord: (...args: unknown[]) => mockGetFileRecord(...args),
  retryDocParse: (...args: unknown[]) => mockRetryDocParse(...args),
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

describe('DocProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a processing message while pending', () => {
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)
    expect(screen.getByText('Processing document…')).toBeInTheDocument()
  })

  it('polls getFileRecord every 3s and refreshes the router once done', async () => {
    mockGetFileRecord.mockResolvedValue({ ...baseRecord, extraction_status: 'done' })
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)

    await act(async () => { vi.advanceTimersByTime(3000) })
    await act(async () => {})

    expect(mockGetFileRecord).toHaveBeenCalledWith('p1', 'ws1')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows Retry after 10 failed poll attempts', async () => {
    mockGetFileRecord.mockResolvedValue(baseRecord)
    render(<DocProcessing fileRecord={baseRecord} workspaceId="ws1" />)

    for (let i = 0; i < 10; i++) {
      await act(async () => { vi.advanceTimersByTime(3000) })
      await act(async () => {})
    }

    expect(screen.getByText('Processing unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
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
  })
})
