import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ workspaceId: 'ws1' })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/lib/actions/query', () => ({
  searchQuery: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/components/query/SearchResults', () => ({
  SearchResults: () => <div data-testid="search-results" />,
}))

vi.mock('@/components/query/AskPanel', () => ({
  AskPanel: () => <div data-testid="ask-panel" />,
}))

import { CmdKModal } from '@/components/query/CmdKModal'
import type { Database } from '@/lib/types/database'

const fakeDatabases: Database[] = [{ id: 'db1', page_id: 'p1', schema: [], created_at: '' }]

describe('CmdKModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is not visible on initial render', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on Cmd+K', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens on Ctrl+K', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when clicking the overlay', () => {
    render(<CmdKModal databases={fakeDatabases} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.click(screen.getByTestId('modal-overlay'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
