import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewDocButton } from '@/components/database/NewDocButton'
import { createPage } from '@/lib/actions/pages'
import type { Page } from '@/lib/types/database'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/lib/actions/pages', () => ({
  createPage: vi.fn(),
}))

function fakePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1', workspace_id: 'ws-1', parent_id: null, database_id: 'db-1',
    title: 'Untitled', created_by: 'u1', created_at: '', updated_at: '', ...overrides,
  }
}

describe('NewDocButton', () => {
  beforeEach(() => {
    mockPush.mockReset()
    vi.mocked(createPage).mockReset()
  })

  it('renders the New doc label, enabled', () => {
    render(<NewDocButton workspaceId="ws-1" databaseId="db-1" />)
    expect(screen.getByRole('button', { name: 'New doc' })).toBeEnabled()
  })

  it('creates a doc scoped to the database and navigates to it', async () => {
    vi.mocked(createPage).mockResolvedValueOnce(fakePage({ id: 'page-42' }))
    render(<NewDocButton workspaceId="ws-1" databaseId="db-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'New doc' }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/workspace/ws-1/page/page-42')
    })
    expect(createPage).toHaveBeenCalledWith('ws-1', null, 'db-1')
  })
})
