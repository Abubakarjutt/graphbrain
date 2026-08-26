import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewDocButton } from '@/components/database/NewDocButton'
import { createRow } from '@/lib/actions/databases'
import type { DatabaseRowWithTitle } from '@/lib/types/database'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/lib/actions/databases', () => ({
  createRow: vi.fn(),
}))

function fakeRow(overrides: Partial<DatabaseRowWithTitle> = {}): DatabaseRowWithTitle {
  return {
    id: 'row-1', database_id: 'db-1', page_id: 'page-1', page_title: null,
    fields: {}, created_at: '', ...overrides,
  }
}

describe('NewDocButton', () => {
  beforeEach(() => {
    mockPush.mockReset()
    vi.mocked(createRow).mockReset()
  })

  it('renders the New doc label, enabled', () => {
    render(<NewDocButton workspaceId="ws-1" databaseId="db-1" />)
    expect(screen.getByRole('button', { name: 'New doc' })).toBeEnabled()
  })

  it('creates a database row and navigates to its page', async () => {
    vi.mocked(createRow).mockResolvedValueOnce(fakeRow({ page_id: 'page-42' }))
    render(<NewDocButton workspaceId="ws-1" databaseId="db-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'New doc' }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/workspace/ws-1/page/page-42')
    })
    expect(createRow).toHaveBeenCalledWith('db-1', 'ws-1')
  })
})
