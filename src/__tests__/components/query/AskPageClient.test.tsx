import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AskPageClient } from '@/components/query/AskPageClient'
import { useAsk } from '@/lib/hooks/useAsk'
import type { QueryLog, SearchResult } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockSearchParamsGet = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}))

vi.mock('@/lib/hooks/useAsk', () => ({
  useAsk: vi.fn(),
}))

function fakeAskState(overrides: Partial<ReturnType<typeof useAsk>> = {}) {
  return {
    query: '',
    setQuery: vi.fn(),
    askedQuery: '',
    scope: {},
    setScope: vi.fn(),
    response: '',
    sources: [] as SearchResult[],
    loading: false,
    error: null as string | null,
    ask: vi.fn(),
    reset: vi.fn(),
    loadSaved: vi.fn(),
    ...overrides,
  }
}

const scopeOptions = [{ id: 'db1', title: 'Roadmap' }]

const recentQueries: QueryLog[] = [
  {
    id: 'q1', workspace_id: 'ws-1', user_id: 'u1',
    query: 'What is graphbrain?', response: 'It is a second brain.',
    sources: [{ node_id: 'n1', entity_type: 'page', entity_id: 'e1', title: 'Overview' }],
    created_at: '',
  },
]

function renderPage(askState = fakeAskState(), overrides: Partial<React.ComponentProps<typeof AskPageClient>> = {}) {
  vi.mocked(useAsk).mockReturnValue(askState)
  return render(
    <AskPageClient workspaceId="ws-1" scopeOptions={scopeOptions} recentQueries={recentQueries} {...overrides} />
  )
}

describe('AskPageClient', () => {
  beforeEach(() => {
    mockSearchParamsGet.mockReturnValue(null)
  })

  it('renders the input and scope options', () => {
    renderPage()
    expect(screen.getByLabelText('Ask a question')).toBeInTheDocument()
    expect(screen.getByText('Roadmap')).toBeInTheDocument()
  })

  it('shows recent questions when nothing has been asked yet', () => {
    renderPage()
    expect(screen.getByText('What is graphbrain?')).toBeInTheDocument()
  })

  it('does not treat mid-typing input as an asked question', () => {
    // query is set (the user is typing) but askedQuery is still empty since
    // nothing has been submitted — recent questions must stay visible and
    // the answer panel must not appear.
    renderPage(fakeAskState({ query: 'still typ' }))
    expect(screen.getByText('What is graphbrain?')).toBeInTheDocument()
    expect(screen.queryByText('still typ')).not.toBeInTheDocument()
    expect(screen.queryByText('Ask a new question')).not.toBeInTheDocument()
  })

  it('hides recent questions once a question has actually been asked', () => {
    renderPage(fakeAskState({ query: 'something', askedQuery: 'something', response: 'an answer' }))
    expect(screen.queryByText('What is graphbrain?')).not.toBeInTheDocument()
  })

  it('loads a saved answer, mapping stored sources into SearchResult shape', () => {
    const state = fakeAskState()
    renderPage(state)

    fireEvent.click(screen.getByText('What is graphbrain?'))

    expect(state.loadSaved).toHaveBeenCalledWith({
      query: 'What is graphbrain?',
      response: 'It is a second brain.',
      sources: [expect.objectContaining({ nodeId: 'n1', entityId: 'e1', title: 'Overview' })],
    })
  })

  it('submits the form by calling ask with no override (uses controlled input value)', () => {
    const state = fakeAskState({ query: 'my question' })
    renderPage(state)

    fireEvent.submit(screen.getByLabelText('Ask a question').closest('form')!)

    expect(state.ask).toHaveBeenCalledWith()
  })

  it('shows a loading indicator while waiting for sources', () => {
    renderPage(fakeAskState({ query: 'q', askedQuery: 'q', loading: true }))
    expect(screen.getByText('Searching knowledge graph…')).toBeInTheDocument()
  })

  it('renders source cards with title, project name, and link', () => {
    const sources: SearchResult[] = [
      { nodeId: 'n1', entityType: 'page', entityId: 'e1', title: 'Doc One', excerpt: '', projectName: 'Vertex Labs', projectDatabaseId: null, score: 1 },
    ]
    renderPage(fakeAskState({ query: 'q', askedQuery: 'q', sources }))

    expect(screen.getByText('Doc One')).toBeInTheDocument()
    expect(screen.getByText('Vertex Labs')).toBeInTheDocument()
    expect(screen.getByText('Doc One').closest('a')).toHaveAttribute('href', '/workspace/ws-1/page/e1')
  })

  it('renders the streamed answer text', () => {
    renderPage(fakeAskState({ query: 'q', askedQuery: 'q', response: 'The answer is 42.' }))
    expect(screen.getByText('The answer is 42.')).toBeInTheDocument()
  })

  it('renders the asked question as the heading, not the live (possibly since-edited) input', () => {
    renderPage(fakeAskState({ query: 'edited after asking', askedQuery: 'original question', response: 'answer' }))
    expect(screen.getByText('original question')).toBeInTheDocument()
    expect(screen.queryByText('edited after asking')).not.toBeInTheDocument()
  })

  it('shows the error message when present', () => {
    renderPage(fakeAskState({ query: 'q', askedQuery: 'q', error: 'AI unavailable' }))
    expect(screen.getByText('AI unavailable')).toBeInTheDocument()
  })

  it('resets when "Ask a new question" is clicked, shown only once settled', () => {
    const state = fakeAskState({ query: 'q', askedQuery: 'q', response: 'answer' })
    renderPage(state)

    const resetButton = screen.getByText('Ask a new question')
    fireEvent.click(resetButton)
    expect(state.reset).toHaveBeenCalledTimes(1)
  })

  it('does not show "Ask a new question" while still loading', () => {
    renderPage(fakeAskState({ query: 'q', askedQuery: 'q', loading: true }))
    expect(screen.queryByText('Ask a new question')).not.toBeInTheDocument()
  })

  it('auto-asks once when a ?q= search param is present on mount', () => {
    mockSearchParamsGet.mockReturnValue('prefilled question')
    const state = fakeAskState()
    renderPage(state)

    expect(state.ask).toHaveBeenCalledWith('prefilled question')
    expect(state.ask).toHaveBeenCalledTimes(1)
  })

  it('does not auto-ask when there is no ?q= search param', () => {
    mockSearchParamsGet.mockReturnValue(null)
    const state = fakeAskState()
    renderPage(state)
    expect(state.ask).not.toHaveBeenCalled()
  })

  it('auto-asks again when a second, different ?q= arrives without a remount (e.g. a repeat Cmd+K deep-link)', () => {
    mockSearchParamsGet.mockReturnValue('first question')
    const state = fakeAskState()
    const { rerender } = renderPage(state)
    expect(state.ask).toHaveBeenCalledWith('first question')

    mockSearchParamsGet.mockReturnValue('second question')
    rerender(<AskPageClient workspaceId="ws-1" scopeOptions={scopeOptions} recentQueries={recentQueries} />)

    expect(state.ask).toHaveBeenCalledWith('second question')
    expect(state.ask).toHaveBeenCalledTimes(2)
  })

  it('does not re-ask on a re-render when the ?q= value is unchanged', () => {
    mockSearchParamsGet.mockReturnValue('same question')
    const state = fakeAskState()
    const { rerender } = renderPage(state)
    expect(state.ask).toHaveBeenCalledTimes(1)

    rerender(<AskPageClient workspaceId="ws-1" scopeOptions={scopeOptions} recentQueries={recentQueries} />)

    expect(state.ask).toHaveBeenCalledTimes(1)
  })
})
