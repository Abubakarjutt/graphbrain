import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TodoAttachDocumentPicker } from '@/components/database/TodoAttachDocumentPicker'
import type { Page } from '@/lib/types/database'

const pages: Page[] = [
  { id: 'p1', workspace_id: 'ws-1', parent_id: null, title: 'Roadmap', created_by: 'u1', created_at: '', updated_at: '' },
  { id: 'p2', workspace_id: 'ws-1', parent_id: null, title: 'Design Doc', created_by: 'u1', created_at: '', updated_at: '' },
  { id: 'p3', workspace_id: 'ws-1', parent_id: null, title: '', created_by: 'u1', created_at: '', updated_at: '' },
]

function renderPicker(overrides: Partial<React.ComponentProps<typeof TodoAttachDocumentPicker>> = {}) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <TodoAttachDocumentPicker pages={pages} onSelect={onSelect} onClose={onClose} {...overrides} />
  )
  return { onSelect, onClose, ...utils }
}

describe('TodoAttachDocumentPicker', () => {
  it('lists every page by title', () => {
    renderPicker()
    expect(screen.getByText('Roadmap')).toBeInTheDocument()
    expect(screen.getByText('Design Doc')).toBeInTheDocument()
  })

  it('falls back to "Untitled" for a page with a blank title', () => {
    renderPicker()
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('filters the list as the user types, case-insensitively', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'road' } })

    expect(screen.getByText('Roadmap')).toBeInTheDocument()
    expect(screen.queryByText('Design Doc')).not.toBeInTheDocument()
  })

  it('shows a "no matching pages" message when the filter matches nothing', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'nonexistent' } })

    expect(screen.getByText('No matching pages')).toBeInTheDocument()
  })

  it('calls onSelect with the chosen page when a result is clicked', () => {
    const { onSelect } = renderPicker()
    fireEvent.click(screen.getByText('Roadmap'))

    expect(onSelect).toHaveBeenCalledWith(pages[0])
  })

  it('calls onClose when Cancel is clicked', () => {
    const { onClose } = renderPicker()
    fireEvent.click(screen.getByText('Cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders an empty-state message when there are no pages at all', () => {
    renderPicker({ pages: [] })
    expect(screen.getByText('No matching pages')).toBeInTheDocument()
  })

  it('treats a whitespace-only query the same as an empty one, showing every page', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: '   ' } })

    expect(screen.getByText('Roadmap')).toBeInTheDocument()
    expect(screen.getByText('Design Doc')).toBeInTheDocument()
  })
})
