import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getDatabase } from '@/lib/actions/databases'
import { getTodoBoard } from '@/lib/actions/todos'
import { getPages } from '@/lib/actions/pages'
import type { TodoBoard, Page } from '@/lib/types/database'

class NotFoundError extends Error {}

const mockFrom = vi.fn()

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new NotFoundError('NEXT_NOT_FOUND') }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))

vi.mock('@/lib/actions/databases', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@/lib/actions/todos', () => ({
  getTodoBoard: vi.fn(),
}))

vi.mock('@/lib/actions/pages', () => ({
  getPages: vi.fn(),
}))

vi.mock('@/components/database/DatabaseShell', () => ({
  DatabaseShell: (props: { title: string; schema: unknown[]; rows: unknown[]; todoBoard: TodoBoard; pages: Page[] }) => (
    <div data-testid="database-shell-stub">
      title:{props.title} fields:{props.schema.length} rows:{props.rows.length} lists:{props.todoBoard.lists.length} pages:{props.pages.length}
    </div>
  ),
}))

const defaultTodoBoard: TodoBoard = { lists: [], items: [], assignees: [] }
const defaultPages: Page[] = []

function makeChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data }) }
}

async function renderPage() {
  const mod = await import('@/app/(app)/workspace/[workspaceId]/database/[databaseId]/page')
  const DatabasePage = mod.default
  const element = await DatabasePage({ params: Promise.resolve({ workspaceId: 'ws-1', databaseId: 'db-1' }) })
  return render(element)
}

describe('DatabasePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('calls notFound when getDatabase throws (missing or access denied)', async () => {
    vi.mocked(getDatabase).mockRejectedValue(new Error('Database not found or access denied'))
    await expect(renderPage()).rejects.toThrow(NotFoundError)
  })

  it('renders DatabaseShell with the container page title, schema, rows, todo board, and workspace pages', async () => {
    vi.mocked(getDatabase).mockResolvedValue({
      id: 'db-1',
      page_id: 'page-1',
      schema: [{ id: 'f1', name: 'Status', type: 'text' }],
      created_at: '',
      rows: [{ id: 'row-1', database_id: 'db-1', page_id: 'page-1', fields: {}, created_at: '', page_title: 'Row One' }],
    })
    mockFrom.mockReturnValueOnce(makeChain({ title: 'My Database' }))
    vi.mocked(getTodoBoard).mockResolvedValue({
      lists: [{ id: 'list-1', database_id: 'db-1', name: 'To Do', position: 0, created_at: '' }],
      items: [],
      assignees: [],
    })
    vi.mocked(getPages).mockResolvedValue([
      { id: 'page-2', workspace_id: 'ws-1', parent_id: 'page-1', title: 'Sub Page', created_by: 'u1', created_at: '', updated_at: '' },
    ])

    await renderPage()

    const shell = screen.getByTestId('database-shell-stub')
    expect(shell).toHaveTextContent('title:My Database')
    expect(shell).toHaveTextContent('fields:1')
    expect(shell).toHaveTextContent('rows:1')
    expect(shell).toHaveTextContent('lists:1')
    expect(shell).toHaveTextContent('pages:1')
  })

  it('falls back to "Untitled Database" when the container page has no title', async () => {
    vi.mocked(getDatabase).mockResolvedValue({
      id: 'db-1', page_id: 'page-1', schema: [], created_at: '', rows: [],
    })
    mockFrom.mockReturnValueOnce(makeChain(null))
    vi.mocked(getTodoBoard).mockResolvedValue(defaultTodoBoard)
    vi.mocked(getPages).mockResolvedValue(defaultPages)

    await renderPage()

    expect(screen.getByTestId('database-shell-stub')).toHaveTextContent('title:Untitled Database')
  })
})
