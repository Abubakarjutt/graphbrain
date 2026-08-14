import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { format } from 'date-fns'
import { DatabaseShell } from '@/components/database/DatabaseShell'
import { updateDatabaseSchema } from '@/lib/actions/databases'
import { createTodoList, createTodoItem, attachPageToTodoItem } from '@/lib/actions/todos'
import type { DatabaseRowWithTitle, Page, TodoBoard, TodoItemWithPage } from '@/lib/types/database'

// Unlike DatabaseShell.test.tsx (which stubs every child view to isolate
// DatabaseShell's own logic), this file mounts the real SchemaEditor,
// KanbanView, and CalendarView together to verify the actual end-to-end
// wiring: the to-do board is a genuinely independent feature from the
// table's schema/rows, and Kanban + Calendar must share the SAME lifted
// board state through DatabaseShell even though they render at different
// times (only one view is mounted at once).
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  closestCorners: vi.fn(),
}))

interface StubEvent { id: string; title: string; start: Date; resource: TodoItemWithPage }
vi.mock('react-big-calendar', () => ({
  Calendar: ({ events, onSelectEvent }: { events: StubEvent[]; onSelectEvent: (e: StubEvent) => void }) => (
    <div data-testid="calendar-stub">
      {events.map(e => (
        <button key={e.id} onClick={() => onSelectEvent(e)}>{e.title} — {format(e.start, 'yyyy-MM-dd')}</button>
      ))}
    </div>
  ),
  dateFnsLocalizer: vi.fn(() => ({})),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/actions/databases', () => ({
  updateDatabaseSchema: vi.fn().mockResolvedValue(undefined),
  updateRowFields: vi.fn().mockResolvedValue(undefined),
  createRow: vi.fn(),
  deleteRow: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/actions/todos', () => ({
  createTodoList: vi.fn(),
  renameTodoList: vi.fn().mockResolvedValue(undefined),
  reorderTodoList: vi.fn().mockResolvedValue(undefined),
  deleteTodoList: vi.fn().mockResolvedValue(undefined),
  createTodoItem: vi.fn(),
  updateTodoItem: vi.fn().mockResolvedValue(undefined),
  deleteTodoItem: vi.fn().mockResolvedValue(undefined),
  attachPageToTodoItem: vi.fn().mockResolvedValue({ title: null }),
}))

const rows: DatabaseRowWithTitle[] = [
  { id: 'row-1', database_id: 'db-1', page_id: 'p1', page_title: 'Task One', fields: {}, created_at: '' },
]

const emptyBoard: TodoBoard = { lists: [], items: [] }

const pages: Page[] = [
  { id: 'page-1', workspace_id: 'ws-1', parent_id: null, database_id: null, title: 'Launch Notes', created_by: 'u1', created_at: '', updated_at: '' },
]

const SHIP_FEATURE_CREATED_AT = '2026-03-01T00:00:00Z'
// created_at is a timestamptz — CalendarView converts it to the viewer's
// local calendar day, which may not match the UTC date string above.
const shipFeatureCreatedDate = format(new Date(SHIP_FEATURE_CREATED_AT), 'yyyy-MM-dd')

describe('DatabaseShell + SchemaEditor + KanbanView + CalendarView integration', () => {
  beforeEach(() => {
    vi.mocked(updateDatabaseSchema).mockReset().mockResolvedValue(undefined)
    vi.mocked(createTodoList).mockReset()
    vi.mocked(createTodoItem).mockReset()
    vi.mocked(attachPageToTodoItem).mockReset().mockResolvedValue({ title: null })
    mockPush.mockReset()
  })

  it('shares to-do board state between the real Kanban and Calendar views, independent of table schema/rows', async () => {
    vi.mocked(createTodoList).mockResolvedValueOnce({ id: 'list-1', database_id: 'db-1', name: 'To Do', position: 0, created_at: '' })
    const createdItem: TodoItemWithPage = {
      id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Ship feature',
      due_date: null, attached_page_id: null, attached_page_title: null, created_at: SHIP_FEATURE_CREATED_AT,
    }
    vi.mocked(createTodoItem).mockResolvedValueOnce(createdItem)

    render(
      <DatabaseShell
        databaseId="db-1"
        workspaceId="ws-1"
        title="My Database"
        schema={[]}
        rows={rows}
        todoBoard={emptyBoard}
        pages={pages}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'To Do' } })
    fireEvent.keyDown(screen.getByLabelText('New list name'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByLabelText('New item in To Do')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('New item in To Do'), { target: { value: 'Ship feature' } })
    fireEvent.keyDown(screen.getByLabelText('New item in To Do'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Ship feature')).toBeInTheDocument())

    // Table view must be completely unaffected by any of this.
    fireEvent.click(screen.getByRole('button', { name: /Table/ }))
    expect(screen.getByText('Task One')).toBeInTheDocument()
    expect(screen.queryByText('Ship feature')).not.toBeInTheDocument()

    // The same item, created via the real Kanban board, must show up in the
    // real Calendar view as a "Created" event — proving the lifted
    // currentTodoBoard state in DatabaseShell is genuinely shared between
    // the two views rather than each holding its own local copy.
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }))
    expect(screen.getByText(`Created: Ship feature — ${shipFeatureCreatedDate}`)).toBeInTheDocument()
  })

  it('lets attaching a document to a to-do item in the real Kanban board make its real Calendar event navigable', async () => {
    const item: TodoItemWithPage = {
      id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Ship feature',
      due_date: null, attached_page_id: null, attached_page_title: null, created_at: SHIP_FEATURE_CREATED_AT,
    }
    const board: TodoBoard = {
      lists: [{ id: 'list-1', database_id: 'db-1', name: 'To Do', position: 0, created_at: '' }],
      items: [item],
    }
    vi.mocked(attachPageToTodoItem).mockResolvedValueOnce({ title: 'Launch Notes' })

    render(
      <DatabaseShell
        databaseId="db-1"
        workspaceId="ws-1"
        title="My Database"
        schema={[]}
        rows={rows}
        todoBoard={board}
        pages={pages}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    fireEvent.click(screen.getByText('+ Attach document'))
    fireEvent.click(screen.getByText('Launch Notes'))

    await waitFor(() => {
      expect(attachPageToTodoItem).toHaveBeenCalledWith('item-1', 'db-1', 'ws-1', 'page-1')
    })

    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }))
    fireEvent.click(screen.getByText(`Created: Ship feature — ${shipFeatureCreatedDate}`))

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-1/page/page-1')
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
        todoBoard={emptyBoard}
        pages={pages}
      />
    )

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
  })
})
