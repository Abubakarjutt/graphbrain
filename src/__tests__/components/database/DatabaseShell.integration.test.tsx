import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DatabaseShell } from '@/components/database/DatabaseShell'
import { updateDatabaseSchema } from '@/lib/actions/databases'
import type { DatabaseRowWithTitle } from '@/lib/types/database'

// Unlike DatabaseShell.test.tsx (which stubs every child view to isolate
// DatabaseShell's own logic), this file mounts the real SchemaEditor and
// KanbanView together to verify the actual end-to-end wiring: a field defined
// in SchemaEditor must flow through DatabaseShell's schema state into
// KanbanView's rendered columns, since that flow is where the original
// "Kanban is not functional" bug and its regressions have both lived.
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  closestCorners: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('@/lib/actions/databases', () => ({
  updateDatabaseSchema: vi.fn().mockResolvedValue(undefined),
  updateRowFields: vi.fn().mockResolvedValue(undefined),
  createRow: vi.fn(),
  deleteRow: vi.fn().mockResolvedValue(undefined),
}))

const rows: DatabaseRowWithTitle[] = [
  { id: 'row-1', database_id: 'db-1', page_id: 'p1', page_title: 'Task One', fields: {}, created_at: '' },
]

describe('DatabaseShell + SchemaEditor + KanbanView integration', () => {
  beforeEach(() => {
    vi.mocked(updateDatabaseSchema).mockReset().mockResolvedValue(undefined)
  })

  it('lets a select field defined in the schema editor immediately populate Kanban columns', async () => {
    render(
      <DatabaseShell
        databaseId="db-1"
        workspaceId="ws-1"
        title="My Database"
        schema={[]}
        rows={rows}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    expect(screen.getByText('Add a Select field to use Kanban view.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Properties/ }))
    fireEvent.change(screen.getByLabelText('New field name'), { target: { value: 'Status' } })
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'select' } })

    const optionInput = screen.getByLabelText('New field option')
    fireEvent.change(optionInput, { target: { value: 'To Do' } })
    fireEvent.keyDown(optionInput, { key: 'Enter' })
    fireEvent.change(optionInput, { target: { value: 'Done' } })
    fireEvent.keyDown(optionInput, { key: 'Enter' })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(updateDatabaseSchema).toHaveBeenCalledWith(
        'db-1', 'ws-1',
        expect.arrayContaining([expect.objectContaining({ name: 'Status', type: 'select', options: ['To Do', 'Done'] })])
      )
    })

    expect(screen.queryByText('Add a Select field to use Kanban view.')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No Status' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByText('Task One')).toBeInTheDocument()
  })

  it('removing a select option in the schema editor does not remove rows still set to it from the Kanban board', async () => {
    render(
      <DatabaseShell
        databaseId="db-1"
        workspaceId="ws-1"
        title="My Database"
        schema={[{ id: 'f-status', name: 'Status', type: 'select', options: ['To Do', 'Done'] }]}
        rows={[{ id: 'row-1', database_id: 'db-1', page_id: 'p1', page_title: 'Task One', fields: { 'f-status': 'Done' }, created_at: '' }]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    expect(screen.getByText('Task One')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Properties/ }))
    fireEvent.click(screen.getByLabelText('Remove option Done from Status'))

    await waitFor(() => {
      expect(updateDatabaseSchema).toHaveBeenCalledWith(
        'db-1', 'ws-1',
        expect.arrayContaining([expect.objectContaining({ options: ['To Do'] })])
      )
    })

    // The row's stored value ("Done") is now orphaned — it must fall back to
    // the No Status column rather than silently vanishing from the board.
    expect(screen.getByText('Task One')).toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('keeps the new field name filled in the real SchemaEditor when the real persist path fails, and does not add the field to the rendered schema', async () => {
    vi.mocked(updateDatabaseSchema).mockRejectedValueOnce(new Error('boom'))
    render(
      <DatabaseShell
        databaseId="db-1"
        workspaceId="ws-1"
        title="My Database"
        schema={[]}
        rows={rows}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    fireEvent.click(screen.getByRole('button', { name: /Properties/ }))
    fireEvent.change(screen.getByLabelText('New field name'), { target: { value: 'Status' } })
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'select' } })
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Failed to update schema')).toBeInTheDocument()
    })

    // This is the exact seam a prior review round's bug lived in: DatabaseShell
    // must resolve the promise it hands to the real SchemaEditor to `false` on
    // a rejected persist, and SchemaEditor must react by keeping the draft —
    // neither side's unit tests alone can catch a break in that contract.
    expect(screen.getByLabelText('New field name')).toHaveValue('Status')
    expect(screen.getByText('Add a Select field to use Kanban view.')).toBeInTheDocument()
  })
})
