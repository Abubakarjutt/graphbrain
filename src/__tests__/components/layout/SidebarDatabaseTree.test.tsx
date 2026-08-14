import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarDatabaseTree } from '@/components/layout/SidebarDatabaseTree'
import type { Database, DatabaseRowLink, Page } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockUseParams = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
}))

function page(overrides: Partial<Page> & Pick<Page, 'id' | 'workspace_id' | 'title'>): Page {
  return {
    parent_id: null,
    database_id: null,
    created_by: 'u1',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// ── Fixture: mirrors the real-world "Vertex Labs" bug shape ─────────────────
// db1's container page is 'db-page-1'. Its rows are linked exclusively via
// database_rows, and are deliberately filed under an unrelated parent page
// ('project-page') to prove the tree does NOT fall back to parent_id.
const dbPage1 = page({ id: 'db-page-1', workspace_id: 'ws1', title: 'Marketing Hub' })
const dbPageUntitled = page({ id: 'db-page-untitled', workspace_id: 'ws1', title: '' })
const dbPageOtherWs = page({ id: 'db-page-other-ws', workspace_id: 'ws2', title: 'Other WS DB' })
const dbPageSecond = page({ id: 'db-page-second', workspace_id: 'ws1', title: 'Second Base' })
const projectPage = page({ id: 'project-page', workspace_id: 'ws1', title: 'Some Project' })

const rowA = page({ id: 'row-a', workspace_id: 'ws1', parent_id: 'project-page', title: 'Row A Page' })
const strayChild = page({ id: 'row-b-stray', workspace_id: 'ws1', parent_id: 'db-page-1', title: 'Stray Child (not a row)' })
const rowUntitled = page({ id: 'row-c-untitled', workspace_id: 'ws1', title: '' })
const rowSecond = page({ id: 'row-second', workspace_id: 'ws1', title: 'Second Row Page' })

const mockPages: Page[] = [
  dbPage1, dbPageUntitled, dbPageOtherWs, dbPageSecond, projectPage,
  rowA, strayChild, rowUntitled, rowSecond,
]

const mockDatabases: Database[] = [
  { id: 'db1', page_id: 'db-page-1', schema: [], created_at: '' },
  { id: 'db-untitled', page_id: 'db-page-untitled', schema: [], created_at: '' },
  { id: 'db-other-ws', page_id: 'db-page-other-ws', schema: [], created_at: '' },
  { id: 'db-second', page_id: 'db-page-second', schema: [], created_at: '' },
]

const mockDatabaseRows: DatabaseRowLink[] = [
  { id: 'dr1', database_id: 'db1', page_id: 'row-a' },
  { id: 'dr2', database_id: 'db1', page_id: 'row-c-untitled' },
  { id: 'dr-null', database_id: 'db1', page_id: null },
  { id: 'dr-dangling', database_id: 'db1', page_id: 'page-does-not-exist' },
  { id: 'dr-second', database_id: 'db-second', page_id: 'row-second' },
]

function renderTree(overrides: Partial<React.ComponentProps<typeof SidebarDatabaseTree>> = {}) {
  const onCreateDatabase = vi.fn()
  const utils = render(
    <SidebarDatabaseTree
      databases={mockDatabases}
      pages={mockPages}
      databaseRows={mockDatabaseRows}
      workspaceId="ws1"
      onCreateDatabase={onCreateDatabase}
      {...overrides}
    />
  )
  return { onCreateDatabase, ...utils }
}

describe('SidebarDatabaseTree', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ workspaceId: 'ws1' })
  })

  it('renders the section label and each database in the current workspace', () => {
    renderTree()
    expect(screen.getByText('Databases')).toBeInTheDocument()
    expect(screen.getByText('Marketing Hub')).toBeInTheDocument()
    expect(screen.getByText('Second Base')).toBeInTheDocument()
  })

  it('excludes databases whose container page belongs to a different workspace', () => {
    renderTree()
    expect(screen.queryByText('Other WS DB')).not.toBeInTheDocument()
  })

  it('falls back to "Untitled Database" when the container page has no title', () => {
    renderTree()
    expect(screen.getByText('Untitled Database')).toBeInTheDocument()
  })

  it('calls onCreateDatabase when the New database button is clicked', async () => {
    const user = userEvent.setup()
    const { onCreateDatabase } = renderTree()
    await user.click(screen.getByRole('button', { name: 'New database' }))
    expect(onCreateDatabase).toHaveBeenCalledTimes(1)
  })

  it('is collapsed by default and shows no row pages', () => {
    renderTree()
    expect(screen.queryByText('Row A Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Second Row Page')).not.toBeInTheDocument()
  })

  it('renders no disclosure triangle icon for a database with no rows', () => {
    renderTree()
    const untitledRow = screen.getByText('Untitled Database').closest('div') as HTMLElement
    const toggle = untitledRow.querySelector('button[aria-label="Expand"]') as HTMLElement
    expect(toggle.querySelector('svg')).toBeNull()
  })

  it('expands to show its linked row pages via database_rows, not parent_id', async () => {
    const user = userEvent.setup()
    renderTree()
    const dbRow = screen.getByText('Marketing Hub').closest('div') as HTMLElement
    const toggle = dbRow.querySelector('button[aria-label="Expand"]') as HTMLElement

    await user.click(toggle)

    // Linked via database_rows — should appear
    expect(screen.getByText('Row A Page')).toBeInTheDocument()
    expect(screen.getByText('Untitled')).toBeInTheDocument()
    // A real child of the container page (parent_id match) but NOT linked
    // via database_rows — must NOT appear, or the old parent_id bug is back.
    expect(screen.queryByText('Stray Child (not a row)')).not.toBeInTheDocument()
  })

  it('collapses again when the disclosure button is clicked a second time', async () => {
    const user = userEvent.setup()
    renderTree()
    const dbRow = screen.getByText('Marketing Hub').closest('div') as HTMLElement
    const toggle = dbRow.querySelector('button[aria-label="Expand"]') as HTMLElement

    await user.click(toggle)
    expect(screen.getByText('Row A Page')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByText('Row A Page')).not.toBeInTheDocument()
  })

  it('silently drops database_rows entries with a null or dangling page_id', async () => {
    // dr-null (page_id: null) and dr-dangling (page_id: 'page-does-not-exist')
    // must not crash the render and must not produce phantom rows — only
    // the two valid links (Row A Page, Untitled) should show.
    const user = userEvent.setup()
    renderTree()
    const dbRow = screen.getByText('Marketing Hub').closest('div') as HTMLElement
    await user.click(dbRow.querySelector('button[aria-label="Expand"]') as HTMLElement)

    const rowLinks = screen.getAllByRole('link').filter(el => el.getAttribute('href')?.includes('/page/'))
    expect(rowLinks).toHaveLength(2)
  })

  it('keeps expand state independent between different databases', async () => {
    const user = userEvent.setup()
    renderTree()
    const marketingRow = screen.getByText('Marketing Hub').closest('div') as HTMLElement
    await user.click(marketingRow.querySelector('button[aria-label="Expand"]') as HTMLElement)

    expect(screen.getByText('Row A Page')).toBeInTheDocument()
    // Second Base was never expanded — its row must stay hidden.
    expect(screen.queryByText('Second Row Page')).not.toBeInTheDocument()
  })

  it('applies active styling to the database matching the current route', () => {
    mockUseParams.mockReturnValue({ workspaceId: 'ws1', databaseId: 'db1' })
    renderTree()
    const classTokens = (el: Element | null) => el?.className.split(' ') ?? []
    expect(classTokens(screen.getByText('Marketing Hub').closest('div'))).toContain('bg-sidebar-accent')
    expect(classTokens(screen.getByText('Second Base').closest('div'))).not.toContain('bg-sidebar-accent')
  })

  it('links each database to its detail route', () => {
    renderTree()
    const link = screen.getByText('Marketing Hub').closest('a')
    expect(link).toHaveAttribute('href', '/workspace/ws1/database/db1')
  })
})
