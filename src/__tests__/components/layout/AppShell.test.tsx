import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AppShell } from '@/components/layout/AppShell'
import type { WorkspaceEntry, Page, Database, DatabaseRowLink } from '@/lib/types/database'

// Sidebar and CmdKModal have their own dedicated test suites — stubbed here
// so this file stays focused on AppShell's own job: mobile-sidebar state and
// prop plumbing, not Sidebar/CmdKModal internals.
vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: ({ workspaces, pages, databases, databaseRows, mobileOpen, onMobileClose }: {
    workspaces: WorkspaceEntry[]
    pages: Page[]
    databases: Database[]
    databaseRows: DatabaseRowLink[]
    mobileOpen?: boolean
    onMobileClose?: () => void
  }) => (
    <div data-testid="sidebar-stub" data-mobile-open={String(mobileOpen)}>
      <span>workspaces:{workspaces.length}</span>
      <span>pages:{pages.length}</span>
      <span>databases:{databases.length}</span>
      <span>databaseRows:{databaseRows.length}</span>
      <button onClick={onMobileClose}>close-from-sidebar</button>
    </div>
  ),
}))

vi.mock('@/components/layout/OllamaStatusBanner', () => ({
  OllamaStatusBanner: ({ ollamaAvailable }: { ollamaAvailable: boolean }) => (
    <div data-testid="ollama-banner">{ollamaAvailable ? 'ollama-ok' : 'ollama-down'}</div>
  ),
}))

vi.mock('@/components/query/CmdKModal', () => ({
  CmdKModal: ({ databases, pages }: { databases: Database[]; pages: Page[] }) => (
    <div data-testid="cmdk-stub">cmdk-pages:{pages.length} cmdk-databases:{databases.length}</div>
  ),
}))

const mockUser = { id: 'user-1', email: 'test@test.com' } as unknown as User

const mockWorkspaces: WorkspaceEntry[] = [
  { workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'My Workspace' } },
]

const mockPages: Page[] = [
  { id: 'p1', workspace_id: 'ws-1', parent_id: null, title: 'Page One', created_by: 'user-1', created_at: '', updated_at: '' },
]

const mockDatabases: Database[] = [
  { id: 'db1', page_id: 'p1', schema: [], created_at: '' },
]

const mockDatabaseRows: DatabaseRowLink[] = [
  { id: 'dr1', database_id: 'db1', page_id: 'p1' },
]

function renderShell(overrides: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  return render(
    <AppShell
      workspaces={mockWorkspaces}
      user={mockUser}
      pages={mockPages}
      databases={mockDatabases}
      databaseRows={mockDatabaseRows}
      {...overrides}
    >
      <div>Page Content</div>
    </AppShell>
  )
}

describe('AppShell', () => {
  it('renders its children in the main content area', () => {
    renderShell()
    expect(screen.getByText('Page Content')).toBeInTheDocument()
  })

  it('defaults ollamaAvailable to true when not provided', () => {
    renderShell()
    expect(screen.getByTestId('ollama-banner')).toHaveTextContent('ollama-ok')
  })

  it('passes ollamaAvailable through when explicitly false', () => {
    renderShell({ ollamaAvailable: false })
    expect(screen.getByTestId('ollama-banner')).toHaveTextContent('ollama-down')
  })

  it('passes workspaces, pages, databases, and databaseRows through to the Sidebar', () => {
    renderShell()
    const sidebar = screen.getByTestId('sidebar-stub')
    expect(sidebar).toHaveTextContent('workspaces:1')
    expect(sidebar).toHaveTextContent('pages:1')
    expect(sidebar).toHaveTextContent('databases:1')
    expect(sidebar).toHaveTextContent('databaseRows:1')
  })

  it('passes pages and databases through to CmdKModal', () => {
    renderShell()
    expect(screen.getByTestId('cmdk-stub')).toHaveTextContent('cmdk-pages:1 cmdk-databases:1')
  })

  it('starts with the mobile sidebar closed and no backdrop', () => {
    renderShell()
    expect(screen.getByTestId('sidebar-stub')).toHaveAttribute('data-mobile-open', 'false')
    expect(document.querySelector('.bg-black\\/40')).not.toBeInTheDocument()
  })

  it('opens the mobile sidebar and shows the backdrop when the menu button is clicked', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))

    expect(screen.getByTestId('sidebar-stub')).toHaveAttribute('data-mobile-open', 'true')
    expect(document.querySelector('.bg-black\\/40')).toBeInTheDocument()
  })

  it('closes the mobile sidebar when the backdrop is clicked', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByTestId('sidebar-stub')).toHaveAttribute('data-mobile-open', 'true')

    fireEvent.click(document.querySelector('.bg-black\\/40') as HTMLElement)
    expect(screen.getByTestId('sidebar-stub')).toHaveAttribute('data-mobile-open', 'false')
    expect(document.querySelector('.bg-black\\/40')).not.toBeInTheDocument()
  })

  it('closes the mobile sidebar when Sidebar reports onMobileClose', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByTestId('sidebar-stub')).toHaveAttribute('data-mobile-open', 'true')

    fireEvent.click(screen.getByText('close-from-sidebar'))
    expect(screen.getByTestId('sidebar-stub')).toHaveAttribute('data-mobile-open', 'false')
  })
})
