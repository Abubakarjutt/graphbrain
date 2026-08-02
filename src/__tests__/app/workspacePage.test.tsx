import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

class NotFoundError extends Error {}

const mockFrom = vi.fn()

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new NotFoundError('NEXT_NOT_FOUND') }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))

vi.mock('@/components/editor/NewPageButton', () => ({
  NewPageButton: (props: { workspaceId: string }) => (
    <button data-testid="new-page-button-stub">new page for {props.workspaceId}</button>
  ),
}))

function makeChain(data: unknown) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data }) }
}

async function renderPage() {
  const mod = await import('@/app/(app)/workspace/[workspaceId]/page')
  const WorkspacePage = mod.default
  const element = await WorkspacePage({ params: Promise.resolve({ workspaceId: 'ws-1' }) })
  return render(element)
}

describe('WorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('calls notFound when the workspace does not exist or is not accessible', async () => {
    mockFrom.mockReturnValueOnce(makeChain(null))
    await expect(renderPage()).rejects.toThrow(NotFoundError)
  })

  it('renders the workspace name in both the header and the heading', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ id: 'ws-1', name: 'Acme Workspace' }))
    await renderPage()

    expect(screen.getAllByText('Acme Workspace').length).toBeGreaterThanOrEqual(2)
  })

  it('renders the empty-state prompt and a New Page button scoped to this workspace', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ id: 'ws-1', name: 'Acme Workspace' }))
    await renderPage()

    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument()
    expect(screen.getByTestId('new-page-button-stub')).toHaveTextContent('new page for ws-1')
  })

  it('shows the search hint', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ id: 'ws-1', name: 'Acme Workspace' }))
    await renderPage()

    expect(screen.getByText('⌘K')).toBeInTheDocument()
  })
})
