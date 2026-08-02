import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AskPanel } from '@/components/query/AskPanel'
import type { SearchResult } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

function source(overrides: Partial<SearchResult> & Pick<SearchResult, 'entityId' | 'title'>): SearchResult {
  return {
    nodeId: '',
    entityType: 'page',
    excerpt: '',
    projectName: null,
    projectDatabaseId: null,
    score: 1,
    ...overrides,
  }
}

const baseProps = {
  response: '',
  sources: [] as SearchResult[],
  loading: false,
  error: null as string | null,
  workspaceId: 'ws-1',
}

describe('AskPanel', () => {
  it('renders nothing when idle (not loading, no response, no error)', () => {
    const { container } = render(<AskPanel {...baseProps} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the loading state while waiting for the first token', () => {
    render(<AskPanel {...baseProps} loading />)
    expect(screen.getByText('Searching knowledge graph…')).toBeInTheDocument()
  })

  it('switches from loading to the streamed response once text starts arriving', () => {
    render(<AskPanel {...baseProps} loading response="The answer starts here" />)
    expect(screen.queryByText('Searching knowledge graph…')).not.toBeInTheDocument()
    expect(screen.getByText('The answer starts here')).toBeInTheDocument()
  })

  it('renders the error message and nothing else, even if a response exists', () => {
    render(<AskPanel {...baseProps} error="AI unavailable" response="ignored answer" loading />)
    expect(screen.getByText('AI unavailable')).toBeInTheDocument()
    expect(screen.queryByText('ignored answer')).not.toBeInTheDocument()
    expect(screen.queryByText('Searching knowledge graph…')).not.toBeInTheDocument()
  })

  it('renders the response text without a Sources section when there are no sources', () => {
    render(<AskPanel {...baseProps} response="Here is what I found." />)
    expect(screen.getByText('Here is what I found.')).toBeInTheDocument()
    expect(screen.queryByText('Sources')).not.toBeInTheDocument()
  })

  it('preserves the full response text including embedded newlines', () => {
    const { container } = render(<AskPanel {...baseProps} response={'Line one\nLine two'} />)
    expect(container.querySelector('p')?.textContent).toBe('Line one\nLine two')
  })

  it('lists each source as a link to its page', () => {
    const sources = [
      source({ entityId: 'e1', title: 'Doc One', nodeId: 'n1' }),
      source({ entityId: 'e2', title: 'Doc Two' }),
    ]
    render(<AskPanel {...baseProps} response="Answer" sources={sources} />)

    expect(screen.getByText('Sources')).toBeInTheDocument()
    const linkOne = screen.getByText('Doc One').closest('a')
    expect(linkOne).toHaveAttribute('href', '/workspace/ws-1/page/e1')
    const linkTwo = screen.getByText('Doc Two').closest('a')
    expect(linkTwo).toHaveAttribute('href', '/workspace/ws-1/page/e2')
  })

  it('shows the project name in parentheses when a source belongs to a project', () => {
    const sources = [source({ entityId: 'e1', title: 'Doc One', projectName: 'Vertex Labs' })]
    render(<AskPanel {...baseProps} response="Answer" sources={sources} />)
    expect(screen.getByText('(Vertex Labs)')).toBeInTheDocument()
  })

  it('omits the project suffix when a source has no project', () => {
    const sources = [source({ entityId: 'e1', title: 'Doc One', projectName: null })]
    render(<AskPanel {...baseProps} response="Answer" sources={sources} />)
    expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument()
  })

  it('does not blow up on a source with a blank nodeId (falls back to entityId as key)', () => {
    const sources = [source({ entityId: 'e1', title: 'Doc One', nodeId: '' })]
    expect(() => render(<AskPanel {...baseProps} response="Answer" sources={sources} />)).not.toThrow()
    expect(screen.getByText('Doc One')).toBeInTheDocument()
  })
})
