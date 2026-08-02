import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewPageButton } from '@/components/editor/NewPageButton'
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
    id: 'page-1',
    workspace_id: 'ws-1',
    parent_id: null,
    title: 'Untitled',
    created_by: 'u1',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('NewPageButton', () => {
  beforeEach(() => {
    mockPush.mockReset()
    vi.mocked(createPage).mockReset()
  })

  it('renders the default label, enabled', () => {
    render(<NewPageButton workspaceId="ws-1" />)
    expect(screen.getByRole('button', { name: '+ New Page' })).toBeEnabled()
  })

  it('creates a page for the given workspace and navigates to it', async () => {
    vi.mocked(createPage).mockResolvedValueOnce(fakePage({ id: 'page-42' }))
    render(<NewPageButton workspaceId="ws-1" />)

    fireEvent.click(screen.getByRole('button', { name: '+ New Page' }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/workspace/ws-1/page/page-42')
    })
    expect(createPage).toHaveBeenCalledWith('ws-1', null)
  })

  it('shows a pending label and disables the button while creating', async () => {
    let resolveCreate!: (page: Page) => void
    vi.mocked(createPage).mockReturnValueOnce(new Promise(resolve => { resolveCreate = resolve }))
    render(<NewPageButton workspaceId="ws-1" />)

    fireEvent.click(screen.getByRole('button', { name: '+ New Page' }))
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()

    resolveCreate(fakePage())
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ New Page' })).toBeEnabled()
    })
  })
})
