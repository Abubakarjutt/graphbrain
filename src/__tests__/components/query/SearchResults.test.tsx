import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchResults } from '@/components/query/SearchResults'
import type { SearchResult } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className, onClick }: {
    href: string
    children: React.ReactNode
    className?: string
    onClick?: () => void
  }) => (
    <a href={href} className={className} onClick={onClick}>{children}</a>
  ),
}))

function result(overrides: Partial<SearchResult> & Pick<SearchResult, 'entityId' | 'title'>): SearchResult {
  return {
    nodeId: `node-${overrides.entityId}`,
    entityType: 'page',
    excerpt: '',
    projectName: null,
    projectDatabaseId: null,
    score: 1,
    ...overrides,
  }
}

describe('SearchResults', () => {
  it('renders nothing when there are no results', () => {
    const { container } = render(<SearchResults results={[]} workspaceId="ws-1" onNavigate={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a standalone result without a project header', () => {
    const results = [result({ entityId: 'e1', title: 'Standalone Doc' })]
    render(<SearchResults results={results} workspaceId="ws-1" onNavigate={vi.fn()} />)
    expect(screen.getByText('Standalone Doc')).toBeInTheDocument()
  })

  it('shows the excerpt when present', () => {
    const results = [result({ entityId: 'e1', title: 'Doc', excerpt: 'a short preview' })]
    render(<SearchResults results={results} workspaceId="ws-1" onNavigate={vi.fn()} />)
    expect(screen.getByText('a short preview')).toBeInTheDocument()
  })

  it('omits the excerpt line when there is none', () => {
    const results = [result({ entityId: 'e1', title: 'Doc', excerpt: '' })]
    render(<SearchResults results={results} workspaceId="ws-1" onNavigate={vi.fn()} />)
    expect(screen.getByText('Doc').closest('a')?.querySelectorAll('p').length).toBe(1)
  })

  it('links to the correct page for each result', () => {
    const results = [result({ entityId: 'entity-42', title: 'Doc' })]
    render(<SearchResults results={results} workspaceId="ws-9" onNavigate={vi.fn()} />)
    expect(screen.getByText('Doc').closest('a')).toHaveAttribute('href', '/workspace/ws-9/page/entity-42')
  })

  it('calls onNavigate when a result is clicked', () => {
    const onNavigate = vi.fn()
    const results = [result({ entityId: 'e1', title: 'Doc' })]
    render(<SearchResults results={results} workspaceId="ws-1" onNavigate={onNavigate} />)

    fireEvent.click(screen.getByText('Doc'))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('groups results under a project heading when they share a projectName', () => {
    const results = [
      result({ entityId: 'e1', title: 'Doc One', projectName: 'Vertex Labs' }),
      result({ entityId: 'e2', title: 'Doc Two', projectName: 'Vertex Labs' }),
    ]
    render(<SearchResults results={results} workspaceId="ws-1" onNavigate={vi.fn()} />)

    expect(screen.getByText('Vertex Labs')).toBeInTheDocument()
    expect(screen.getByText('Doc One')).toBeInTheDocument()
    expect(screen.getByText('Doc Two')).toBeInTheDocument()
  })

  it('keeps standalone results (no project) out of any project heading', () => {
    const results = [
      result({ entityId: 'e1', title: 'Grouped Doc', projectName: 'Vertex Labs' }),
      result({ entityId: 'e2', title: 'Loose Doc', projectName: null }),
    ]
    render(<SearchResults results={results} workspaceId="ws-1" onNavigate={vi.fn()} />)

    // Only one project heading should exist; the standalone result gets none.
    expect(screen.getAllByText('Vertex Labs')).toHaveLength(1)
    expect(screen.getByText('Loose Doc')).toBeInTheDocument()
  })

  it('renders separate headings for results from different projects', () => {
    const results = [
      result({ entityId: 'e1', title: 'Doc A', projectName: 'Vertex Labs' }),
      result({ entityId: 'e2', title: 'Doc B', projectName: 'Trivio' }),
    ]
    render(<SearchResults results={results} workspaceId="ws-1" onNavigate={vi.fn()} />)

    expect(screen.getByText('Vertex Labs')).toBeInTheDocument()
    expect(screen.getByText('Trivio')).toBeInTheDocument()
  })

  it('does not crash on a result with an empty nodeId', () => {
    const results = [result({ entityId: 'e1', title: 'Doc', nodeId: '' })]
    expect(() =>
      render(<SearchResults results={results} workspaceId="ws-1" onNavigate={vi.fn()} />)
    ).not.toThrow()
    expect(screen.getByText('Doc')).toBeInTheDocument()
  })
})
