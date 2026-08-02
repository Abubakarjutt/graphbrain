import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { format } from 'date-fns'
import { CalendarView } from '@/components/database/CalendarView'
import { createTodoItem } from '@/lib/actions/todos'
import type { TodoBoard, TodoItemWithPage, TodoList } from '@/lib/types/database'

// react-big-calendar's real Calendar does month-grid layout that needs
// browser APIs jsdom doesn't provide, and its rendering isn't CalendarView's
// own logic anyway. Stubbed to expose the mapped events (including the style
// eventPropGetter assigns them) and a way to invoke onSelectSlot/onSelectEvent
// directly, so this file tests CalendarView's own event-mapping and
// slot/click handling, not the third-party widget.
interface StubEvent { id: string; title: string; start: Date; resource: TodoItemWithPage; kind: 'created' | 'due' }
let capturedOnSelectSlot: ((slot: { start: Date; end: Date }) => void) | null = null

vi.mock('react-big-calendar', () => ({
  Calendar: ({ events, onSelectSlot, onSelectEvent, eventPropGetter }: {
    events: StubEvent[]
    onSelectSlot: (slot: { start: Date; end: Date }) => void
    onSelectEvent: (event: StubEvent) => void
    eventPropGetter: (event: StubEvent) => { style?: Record<string, string> }
  }) => {
    capturedOnSelectSlot = onSelectSlot
    return (
      <div data-testid="calendar-stub">
        {events.map(e => (
          <button
            key={e.id}
            style={eventPropGetter(e).style}
            onClick={() => onSelectEvent(e)}
          >
            {e.title} — {format(e.start, 'yyyy-MM-dd')}
          </button>
        ))}
      </div>
    )
  },
  dateFnsLocalizer: vi.fn(() => ({})),
}))

vi.mock('@/lib/actions/todos', () => ({
  createTodoItem: vi.fn(),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const lists: TodoList[] = [
  { id: 'list-1', database_id: 'db-1', name: 'To Do', position: 0, created_at: '' },
  { id: 'list-2', database_id: 'db-1', name: 'Done', position: 1, created_at: '' },
]

const items: TodoItemWithPage[] = [
  { id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Write report', due_date: '2026-03-15', attached_page_id: 'page-1', attached_page_title: 'Report Doc', created_at: '2026-03-01T00:00:00Z' },
  { id: 'item-2', database_id: 'db-1', list_id: 'list-1', title: 'No due date yet', due_date: null, attached_page_id: null, attached_page_title: null, created_at: '2026-03-02T00:00:00Z' },
]

const board: TodoBoard = { lists, items }

function renderCalendar(overrides: Partial<React.ComponentProps<typeof CalendarView>> = {}) {
  const onBoardChange = vi.fn()
  const utils = render(
    <CalendarView
      databaseId="db-1"
      workspaceId="ws-1"
      board={board}
      onBoardChange={onBoardChange}
      {...overrides}
    />
  )
  return { onBoardChange, ...utils }
}

describe('CalendarView', () => {
  beforeEach(() => {
    capturedOnSelectSlot = null
    vi.mocked(createTodoItem).mockReset()
    mockPush.mockReset()
  })

  it('shows a "Created" event for every item, on its created date', () => {
    renderCalendar()
    expect(screen.getByText('Created: Write report — 2026-03-01')).toBeInTheDocument()
    expect(screen.getByText('Created: No due date yet — 2026-03-02')).toBeInTheDocument()
  })

  it('additionally shows a "Due" event only for items that have a due date', () => {
    renderCalendar()
    expect(screen.getByText('Due: Write report — 2026-03-15')).toBeInTheDocument()
    expect(screen.queryByText(/Due: No due date yet/)).not.toBeInTheDocument()
  })

  it('gives due-date events a visually distinct style from created-date events', () => {
    renderCalendar()
    const created = screen.getByText('Created: Write report — 2026-03-01')
    const due = screen.getByText('Due: Write report — 2026-03-15')
    expect(created.style.backgroundColor).not.toBe(due.style.backgroundColor)
  })

  it('navigates to the attached page when a due-date event is clicked', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('Due: Write report — 2026-03-15'))
    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-1/page/page-1')
  })

  it('navigates to the attached page when a created-date event is clicked', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('Created: Write report — 2026-03-01'))
    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-1/page/page-1')
  })

  it('does not navigate when the item has no attached document', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('Created: No due date yet — 2026-03-02'))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('creates a new to-do item due on the selected slot date, in the first list by position', async () => {
    const created = { id: 'new-item', database_id: 'db-1', list_id: 'list-1', title: 'New to-do', due_date: '2026-04-01', attached_page_id: null, attached_page_title: null, created_at: '' }
    vi.mocked(createTodoItem).mockResolvedValueOnce(created)
    const { onBoardChange } = renderCalendar({ board: { ...board, lists: [lists[1], lists[0]] } })

    capturedOnSelectSlot!({ start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-01T00:00:00') })

    await waitFor(() => {
      expect(createTodoItem).toHaveBeenCalledWith('list-1', 'db-1', 'ws-1', 'New to-do', '2026-04-01')
    })
    expect(onBoardChange).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({ id: 'new-item' })]),
    }))
  })

  it('shows an error instead of creating an item when the board has no lists yet', async () => {
    const { onBoardChange } = renderCalendar({ board: { lists: [], items: [] } })

    capturedOnSelectSlot!({ start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-01T00:00:00') })

    expect(createTodoItem).not.toHaveBeenCalled()
    expect(onBoardChange).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText('Add a list in Kanban view before creating to-do items here')).toBeInTheDocument()
    })
  })

  it('shows an error message when creating a to-do item from a selected slot fails', async () => {
    vi.mocked(createTodoItem).mockRejectedValueOnce(new Error('boom'))
    renderCalendar()

    capturedOnSelectSlot!({ start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-01T00:00:00') })

    await waitFor(() => {
      expect(screen.getByText('Failed to create to-do item')).toBeInTheDocument()
    })
  })

  it('clears a previous error once a later slot selection succeeds', async () => {
    vi.mocked(createTodoItem).mockRejectedValueOnce(new Error('boom'))
    renderCalendar()

    capturedOnSelectSlot!({ start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-01T00:00:00') })
    await waitFor(() => {
      expect(screen.getByText('Failed to create to-do item')).toBeInTheDocument()
    })

    vi.mocked(createTodoItem).mockResolvedValueOnce({ id: 'new-item-2', database_id: 'db-1', list_id: 'list-1', title: 'New to-do', due_date: '2026-04-02', attached_page_id: null, attached_page_title: null, created_at: '' })
    capturedOnSelectSlot!({ start: new Date('2026-04-02T00:00:00'), end: new Date('2026-04-02T00:00:00') })

    await waitFor(() => {
      expect(screen.queryByText('Failed to create to-do item')).not.toBeInTheDocument()
    })
  })
})
