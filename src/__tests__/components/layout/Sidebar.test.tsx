import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { Sidebar } from '@/components/layout/Sidebar'

vi.mock('@/lib/actions/pages', () => ({ createPage: vi.fn() }))
vi.mock('@/lib/actions/databases', () => ({ createDatabase: vi.fn() }))

const mockUsePathname = vi.fn().mockReturnValue('/workspace/ws-1')
vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ workspaceId: 'ws-1' }),
  usePathname: () => mockUsePathname(),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className, style }: { href: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <a href={href} className={className} style={style}>{children}</a>
  ),
}))

const mockUser = { id: 'user-1', email: 'test@test.com' } as unknown as User

const mockWorkspaces = [
  { workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'My Workspace' } },
  { workspace_id: 'ws-2', role: 'editor', workspaces: { id: 'ws-2', name: 'Team Workspace' } },
]

describe('Sidebar', () => {
  it('renders workspace names', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(screen.getByText('Team Workspace')).toBeInTheDocument()
  })

  it('highlights the active workspace', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
    const activeLink = screen.getByText('My Workspace').closest('a')
    expect(activeLink?.className).toContain('bg-sidebar-accent')
  })

  it('renders user email at bottom', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
    expect(screen.getByText('test@test.com')).toBeInTheDocument()
  })

  it('renders graphbrain brand name', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
    expect(screen.getByText('graphbrain')).toBeInTheDocument()
  })

  it('links Ask to the current workspace', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
    expect(screen.getByText('Ask AI').closest('a')).toHaveAttribute('href', '/workspace/ws-1/ask')
  })

  it('highlights Ask as active when on the ask route', () => {
    mockUsePathname.mockReturnValue('/workspace/ws-1/ask')
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
    const link = screen.getByText('Ask AI').closest('a') as HTMLElement
    expect(link.style.fontWeight).toBe('600')
  })

  it('does not highlight Ask when on a different route', () => {
    mockUsePathname.mockReturnValue('/workspace/ws-1')
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
    const link = screen.getByText('Ask AI').closest('a') as HTMLElement
    expect(link.style.fontWeight).toBe('500')
  })
})
