import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ workspaceId: 'ws1' })),
  usePathname: vi.fn(() => '/workspace/ws1'),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

vi.mock('@/lib/actions/query', () => ({
  searchQuery: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/components/query/SearchResults', () => ({
  SearchResults: () => <div data-testid="search-results" />,
}))

import { CmdKModal } from '@/components/query/CmdKModal'
import type { Database, Page } from '@/lib/types/database'

const fakeDatabases: Database[] = [{ id: 'db1', page_id: 'p1', schema: [], created_at: '' }]
const fakePages: Page[] = [{ id: 'p1', workspace_id: 'ws1', parent_id: null, database_id: null, title: 'Projects', created_by: 'u1', created_at: '', updated_at: '' }]

describe('CmdKModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not visible on initial render', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on Cmd+K', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens on Ctrl+K', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when clicking the overlay', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.click(screen.getByTestId('modal-overlay'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a generic "Ask AI" prompt when the query is empty', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByText('Ask AI')).toBeInTheDocument()
  })

  it('shows the typed query in the Ask AI prompt', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.change(screen.getByPlaceholderText('Search pages and databases…'), { target: { value: 'onboarding flow' } })
    expect(screen.getByText('Ask AI about "onboarding flow"')).toBeInTheDocument()
  })

  it('navigates to the dedicated Ask page with the query and closes the modal', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.change(screen.getByPlaceholderText('Search pages and databases…'), { target: { value: 'onboarding flow' } })

    fireEvent.click(screen.getByText('Ask AI about "onboarding flow"'))

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws1/ask?q=onboarding%20flow')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates to the Ask page with no query param when the search box is empty', () => {
    render(<CmdKModal databases={fakeDatabases} pages={fakePages} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    fireEvent.click(screen.getByText('Ask AI'))

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws1/ask')
  })
})
