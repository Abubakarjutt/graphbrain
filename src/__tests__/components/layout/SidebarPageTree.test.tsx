import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarPageTree } from '@/components/layout/SidebarPageTree'
import type { Page } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a>,
}))
vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ workspaceId: 'ws1', pageId: 'p1' }),
}))

const mockPages: Page[] = [
  { id: 'p1', workspace_id: 'ws1', parent_id: null, database_id: null, title: 'Root Page', created_by: 'u1', created_at: '', updated_at: '' },
  { id: 'p2', workspace_id: 'ws1', parent_id: 'p1', database_id: null, title: 'Child Page', created_by: 'u1', created_at: '', updated_at: '' },
]

describe('SidebarPageTree', () => {
  it('renders top-level pages', () => {
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={vi.fn()} />)
    expect(screen.getByText('Root Page')).toBeInTheDocument()
  })

  it('does not render child pages at root level', () => {
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={vi.fn()} />)
    expect(screen.queryByText('Child Page')).not.toBeInTheDocument()
  })

  it('expands to show child pages on click', () => {
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText('Child Page')).toBeInTheDocument()
  })

  it('calls onCreatePage with null parentId when + button clicked', () => {
    const onCreatePage = vi.fn()
    render(<SidebarPageTree pages={mockPages} workspaceId="ws1" onCreatePage={onCreatePage} />)
    fireEvent.click(screen.getByRole('button', { name: /new doc/i }))
    expect(onCreatePage).toHaveBeenCalledWith(null)
  })

  it('renders a New doc empty state when there are no pages', () => {
    const onCreatePage = vi.fn()
    render(<SidebarPageTree pages={[]} workspaceId="ws1" onCreatePage={onCreatePage} />)
    // Both the header "+" and the empty-state CTA expose the "New doc" name.
    const buttons = screen.getAllByRole('button', { name: /new doc/i })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[buttons.length - 1])
    expect(onCreatePage).toHaveBeenCalledWith(null)
  })
})
