import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getDatabase } from '@/lib/actions/databases'

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

vi.mock('@/components/database/DatabaseShell', () => ({
  DatabaseShell: (props: { title: string; schema: unknown[]; rows: unknown[] }) => (
    <div data-testid="database-shell-stub">
      title:{props.title} fields:{props.schema.length} rows:{props.rows.length}
    </div>
  ),
}))

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

  it('renders DatabaseShell with the container page title, schema, and rows', async () => {
    vi.mocked(getDatabase).mockResolvedValue({
      id: 'db-1',
      page_id: 'page-1',
      schema: [{ id: 'f1', name: 'Status', type: 'text' }],
      created_at: '',
      rows: [{ id: 'row-1', database_id: 'db-1', page_id: 'page-1', fields: {}, created_at: '', page_title: 'Row One' }],
    })
    mockFrom.mockReturnValueOnce(makeChain({ title: 'My Database' }))

    await renderPage()

    const shell = screen.getByTestId('database-shell-stub')
    expect(shell).toHaveTextContent('title:My Database')
    expect(shell).toHaveTextContent('fields:1')
    expect(shell).toHaveTextContent('rows:1')
  })

  it('falls back to "Untitled Database" when the container page has no title', async () => {
    vi.mocked(getDatabase).mockResolvedValue({
      id: 'db-1', page_id: 'page-1', schema: [], created_at: '', rows: [],
    })
    mockFrom.mockReturnValueOnce(makeChain(null))

    await renderPage()

    expect(screen.getByTestId('database-shell-stub')).toHaveTextContent('title:Untitled Database')
  })
})
