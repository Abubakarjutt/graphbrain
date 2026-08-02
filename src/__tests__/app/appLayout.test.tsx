import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { checkHealth } from '@/lib/graph/ollama'

class RedirectError extends Error {
  constructor(public readonly url: string) { super(`NEXT_REDIRECT: ${url}`) }
}

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new RedirectError(url) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))

vi.mock('@/lib/graph/ollama', () => ({
  checkHealth: vi.fn(),
}))

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: (props: {
    workspaces: unknown[]; pages: unknown[]; databases: unknown[]
    databaseRows: unknown[]; ollamaAvailable: boolean; children: React.ReactNode
  }) => (
    <div data-testid="app-shell-stub">
      ws:{props.workspaces.length} pages:{props.pages.length} dbs:{props.databases.length}
      rows:{props.databaseRows.length} ollama:{String(props.ollamaAvailable)}
      {props.children}
    </div>
  ),
}))

function membersChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data }) }
}
function orderedInChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data }) }
}
function inOnlyChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data }) }
}

async function renderLayout() {
  const mod = await import('@/app/(app)/layout')
  const AppLayout = mod.default
  const element = await AppLayout({ children: <div>page content</div> })
  return render(element)
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.mocked(checkHealth).mockResolvedValue(true)
  })

  it('redirects to /login and makes no data queries when there is no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(renderLayout()).rejects.toThrow(RedirectError)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('renders empty collections when the user has no workspaces, without querying pages/databases/rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce(membersChain([]))

    await renderLayout()

    const shell = screen.getByTestId('app-shell-stub')
    expect(shell).toHaveTextContent('ws:0')
    expect(shell).toHaveTextContent('pages:0')
    expect(shell).toHaveTextContent('dbs:0')
    expect(shell).toHaveTextContent('rows:0')
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('queries pages once a workspace exists, but skips databases/rows when there are no pages', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom
      .mockReturnValueOnce(membersChain([{ workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'WS' } }]))
      .mockReturnValueOnce(orderedInChain([]))

    await renderLayout()

    expect(mockFrom).toHaveBeenCalledTimes(2)
    const shell = screen.getByTestId('app-shell-stub')
    expect(shell).toHaveTextContent('ws:1')
    expect(shell).toHaveTextContent('pages:0')
    expect(shell).toHaveTextContent('dbs:0')
  })

  it('queries databases once pages exist, but skips database_rows when there are no databases', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom
      .mockReturnValueOnce(membersChain([{ workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'WS' } }]))
      .mockReturnValueOnce(orderedInChain([{ id: 'p1', workspace_id: 'ws-1', parent_id: null, title: 'Page', created_by: 'u1', created_at: '', updated_at: '' }]))
      .mockReturnValueOnce(inOnlyChain([]))

    await renderLayout()

    expect(mockFrom).toHaveBeenCalledTimes(3)
    const shell = screen.getByTestId('app-shell-stub')
    expect(shell).toHaveTextContent('pages:1')
    expect(shell).toHaveTextContent('dbs:0')
    expect(shell).toHaveTextContent('rows:0')
  })

  it('passes fully populated workspaces, pages, databases, and database rows through to AppShell', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom
      .mockReturnValueOnce(membersChain([{ workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'WS' } }]))
      .mockReturnValueOnce(orderedInChain([{ id: 'p1', workspace_id: 'ws-1', parent_id: null, title: 'Page', created_by: 'u1', created_at: '', updated_at: '' }]))
      .mockReturnValueOnce(inOnlyChain([{ id: 'db1', page_id: 'p1', schema: [], created_at: '' }]))
      .mockReturnValueOnce(inOnlyChain([{ id: 'dr1', database_id: 'db1', page_id: 'p1' }]))

    await renderLayout()

    const shell = screen.getByTestId('app-shell-stub')
    expect(shell).toHaveTextContent('ws:1')
    expect(shell).toHaveTextContent('pages:1')
    expect(shell).toHaveTextContent('dbs:1')
    expect(shell).toHaveTextContent('rows:1')
  })

  it('renders the page content as children inside AppShell', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce(membersChain([]))
    await renderLayout()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })

  it('passes ollamaAvailable through as false when Ollama is unreachable', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce(membersChain([]))
    vi.mocked(checkHealth).mockResolvedValue(false)

    await renderLayout()

    expect(screen.getByTestId('app-shell-stub')).toHaveTextContent('ollama:false')
  })
})
