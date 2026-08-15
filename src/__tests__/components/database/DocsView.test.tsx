import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocsView } from '@/components/database/DocsView'
import type { Page } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@/components/database/NewDocButton', () => ({
  NewDocButton: () => <button>New doc</button>,
}))
vi.mock('@/components/database/DocUploadButton', () => ({
  DocUploadButton: () => <button>Upload document</button>,
}))

const docs: Page[] = [
  { id: 'doc-1', workspace_id: 'ws-1', parent_id: null, database_id: 'db-1', title: 'Spec Draft', created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '' },
  { id: 'doc-2', workspace_id: 'ws-1', parent_id: null, database_id: 'db-1', title: 'Meeting Notes', created_by: 'u1', created_at: '2026-01-02T00:00:00Z', updated_at: '' },
]

describe('DocsView', () => {
  it('renders New doc and Upload document actions', () => {
    render(<DocsView databaseId="db-1" workspaceId="ws-1" docs={[]} />)
    expect(screen.getByText('New doc')).toBeInTheDocument()
    expect(screen.getByText('Upload document')).toBeInTheDocument()
  })

  it('shows an empty state when there are no docs', () => {
    render(<DocsView databaseId="db-1" workspaceId="ws-1" docs={[]} />)
    expect(screen.getByText('No docs yet.')).toBeInTheDocument()
  })

  it('lists docs linking to their page route', () => {
    render(<DocsView databaseId="db-1" workspaceId="ws-1" docs={docs} />)
    expect(screen.getByRole('link', { name: 'Spec Draft' })).toHaveAttribute('href', '/workspace/ws-1/page/doc-1')
    expect(screen.getByRole('link', { name: 'Meeting Notes' })).toHaveAttribute('href', '/workspace/ws-1/page/doc-2')
  })
})
