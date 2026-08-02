import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getRecentQueries } from '@/lib/actions/query'
import type { QueryLog } from '@/lib/types/database'

class NotFoundError extends Error {}

const mockFrom = vi.fn()

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new NotFoundError('NEXT_NOT_FOUND') }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))

vi.mock('@/lib/actions/query', () => ({
  getRecentQueries: vi.fn(),
}))

vi.mock('@/components/query/AskPageClient', () => ({
  AskPageClient: (props: { workspaceId: string; scopeOptions: { id: string; title: string }[]; recentQueries: QueryLog[] }) => (
    <div data-testid="ask-page-client-stub">
      ws:{props.workspaceId} scopes:{props.scopeOptions.map(o => o.title).join(',')} recent:{props.recentQueries.length}
    </div>
  ),
}))

function workspaceChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data }) }
}
function pagesChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data }) }
}
function databasesChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data }) }
}

const memberWorkspace = { id: 'ws-1' }

async function renderPage() {
  const mod = await import('@/app/(app)/workspace/[workspaceId]/ask/page')
  const AskPage = mod.default
  const element = await AskPage({ params: Promise.resolve({ workspaceId: 'ws-1' }) })
  return render(element)
}

describe('AskPage', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFrom.mockReset()
    vi.mocked(getRecentQueries).mockReset().mockResolvedValue([])
  })

  it('calls notFound when the workspace does not exist or the user is not a member', async () => {
    mockFrom
      .mockReturnValueOnce(workspaceChain(null))
      .mockReturnValueOnce(pagesChain([]))

    await expect(renderPage()).rejects.toThrow(NotFoundError)
  })

  it('builds scope options from databases, labeled by their container page title', async () => {
    mockFrom
      .mockReturnValueOnce(workspaceChain(memberWorkspace))
      .mockReturnValueOnce(pagesChain([{ id: 'p1', title: 'Roadmap' }]))
      .mockReturnValueOnce(databasesChain([{ id: 'db1', page_id: 'p1' }]))

    await renderPage()

    expect(screen.getByTestId('ask-page-client-stub')).toHaveTextContent('scopes:Roadmap')
  })

  it('falls back to "Untitled Database" when the container page title is missing', async () => {
    // pageIds must be non-empty for the databases query to fire at all — the
    // container page here just isn't the one the database actually points to.
    mockFrom
      .mockReturnValueOnce(workspaceChain(memberWorkspace))
      .mockReturnValueOnce(pagesChain([{ id: 'p1', title: 'Some Other Page' }]))
      .mockReturnValueOnce(databasesChain([{ id: 'db1', page_id: 'page-not-in-workspace-pages' }]))

    await renderPage()

    expect(screen.getByTestId('ask-page-client-stub')).toHaveTextContent('scopes:Untitled Database')
  })

  it('skips the databases query and yields no scope options when the workspace has no pages', async () => {
    mockFrom
      .mockReturnValueOnce(workspaceChain(memberWorkspace))
      .mockReturnValueOnce(pagesChain([]))

    await renderPage()

    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('ask-page-client-stub')).toHaveTextContent('scopes:')
  })

  it('passes recent queries through to the client', async () => {
    mockFrom
      .mockReturnValueOnce(workspaceChain(memberWorkspace))
      .mockReturnValueOnce(pagesChain([]))
    vi.mocked(getRecentQueries).mockResolvedValue([
      { id: 'q1', workspace_id: 'ws-1', user_id: 'u1', query: 'q', response: 'a', sources: [], created_at: '' },
    ])

    await renderPage()

    expect(getRecentQueries).toHaveBeenCalledWith('ws-1')
    expect(screen.getByTestId('ask-page-client-stub')).toHaveTextContent('recent:1')
  })
})
