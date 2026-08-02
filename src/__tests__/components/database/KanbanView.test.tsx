import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { KanbanView } from '@/components/database/KanbanView'
import { updateRowFields } from '@/lib/actions/databases'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'

// Must match the private NO_STATUS_ID sentinel in KanbanView.tsx.
const NO_STATUS_ID = '__kanban-no-status-f47ac10b__'

type DragEvent = { active: { id: string }; over: { id: string } | null }
let capturedOnDragEnd: ((event: DragEvent) => void) | null = null

// Real @dnd-kit drag physics aren't testable in jsdom (no pointer capture) and
// aren't KanbanView's own logic anyway. DndContext is stubbed to capture the
// onDragEnd callback so it can be invoked directly with a synthetic event —
// this tests exactly what KanbanView does with a completed drag, not dnd-kit.
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (e: DragEvent) => void }) => {
    capturedOnDragEnd = onDragEnd
    return <>{children}</>
  },
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
  updateRowFields: vi.fn().mockResolvedValue(undefined),
}))

const selectSchema: DatabaseField[] = [
  { id: 'status', name: 'Status', type: 'select', options: ['To Do', 'In Progress', 'Done'] },
]

const rows: DatabaseRowWithTitle[] = [
  { id: 'row-1', database_id: 'db-1', page_id: 'page-1', page_title: 'Task One', fields: { status: 'To Do' }, created_at: '' },
  { id: 'row-2', database_id: 'db-1', page_id: null, page_title: 'Task Two', fields: { status: 'In Progress' }, created_at: '' },
  { id: 'row-3', database_id: 'db-1', page_id: 'page-3', page_title: null, fields: {}, created_at: '' },
]

function renderBoard(overrides: Partial<React.ComponentProps<typeof KanbanView>> = {}) {
  const onRowUpdate = vi.fn()
  const utils = render(
    <KanbanView
      databaseId="db-1"
      workspaceId="ws-1"
      schema={selectSchema}
      rows={rows}
      onRowUpdate={onRowUpdate}
      {...overrides}
    />
  )
  return { onRowUpdate, ...utils }
}

describe('KanbanView', () => {
  beforeEach(() => {
    capturedOnDragEnd = null
    vi.mocked(updateRowFields).mockReset().mockResolvedValue(undefined)
  })

  it('shows a prompt instead of a board when the schema has no select field', () => {
    render(
      <KanbanView
        databaseId="db-1"
        workspaceId="ws-1"
        schema={[{ id: 'f1', name: 'Notes', type: 'text' }]}
        rows={rows}
        onRowUpdate={vi.fn()}
      />
    )
    expect(screen.getByText('Add a Select field to use Kanban view.')).toBeInTheDocument()
    expect(screen.queryByText('To Do')).not.toBeInTheDocument()
  })

  it('renders one column per select option plus a No Status column', () => {
    renderBoard()
    expect(screen.getByText('No Status')).toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('buckets each row under the column matching its select value', () => {
    renderBoard()
    expect(screen.getByText('Task One')).toBeInTheDocument()
    expect(screen.getByText('Task Two')).toBeInTheDocument()
  })

  it('buckets a row with no value under No Status and falls back to Untitled', () => {
    renderBoard()
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('renders a card title as a link when the row has a page', () => {
    renderBoard()
    const link = screen.getByText('Task One').closest('a')
    expect(link).toHaveAttribute('href', '/workspace/ws-1/page/page-1')
  })

  it('renders a card title as plain text when the row has no page', () => {
    renderBoard()
    expect(screen.getByText('Task Two').closest('a')).toBeNull()
  })

  it('does nothing when a drag ends outside any droppable column', () => {
    const { onRowUpdate } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'row-1' }, over: null })
    expect(onRowUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when dropped back onto the column the row is already in', () => {
    const { onRowUpdate } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'row-1' }, over: { id: 'To Do' } })
    expect(onRowUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when a row with no status is dropped back onto No Status', () => {
    const { onRowUpdate } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'row-3' }, over: { id: NO_STATUS_ID } })
    expect(onRowUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when a row whose stored value is an orphaned (removed) option is dropped back onto No Status', () => {
    const { onRowUpdate } = renderBoard({
      rows: [
        { id: 'row-orphan', database_id: 'db-1', page_id: null, page_title: 'Orphan Task', fields: { status: 'Archived' }, created_at: '' },
      ],
    })
    capturedOnDragEnd!({ active: { id: 'row-orphan' }, over: { id: NO_STATUS_ID } })
    expect(onRowUpdate).not.toHaveBeenCalled()
  })

  it('does nothing and does not crash when the dragged row id is unknown', () => {
    const { onRowUpdate } = renderBoard()
    expect(() => capturedOnDragEnd!({ active: { id: 'ghost-row' }, over: { id: 'Done' } })).not.toThrow()
    expect(onRowUpdate).not.toHaveBeenCalled()
  })

  it('moves a row to a new column, optimistically and via the server action', async () => {
    const { onRowUpdate } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'row-1' }, over: { id: 'Done' } })

    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ status: 'Done' }))
    await waitFor(() => {
      expect(updateRowFields).toHaveBeenCalledWith('row-1', 'db-1', 'ws-1', expect.objectContaining({ status: 'Done' }))
    })
  })

  it('sets the field to null when a row is dropped onto No Status', () => {
    const { onRowUpdate } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'row-1' }, over: { id: NO_STATUS_ID } })
    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ status: null }))
  })

  it('reverts the optimistic move when the server action fails', async () => {
    vi.mocked(updateRowFields).mockRejectedValueOnce(new Error('boom'))
    const { onRowUpdate } = renderBoard()

    capturedOnDragEnd!({ active: { id: 'row-1' }, over: { id: 'Done' } })
    expect(onRowUpdate).toHaveBeenNthCalledWith(1, 'row-1', expect.objectContaining({ status: 'Done' }))

    await waitFor(() => {
      expect(onRowUpdate).toHaveBeenNthCalledWith(2, 'row-1', rows[0].fields)
    })
  })
})
