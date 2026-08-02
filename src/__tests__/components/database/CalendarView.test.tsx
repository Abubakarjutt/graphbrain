import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { format } from 'date-fns'
import { CalendarView } from '@/components/database/CalendarView'
import { createRow } from '@/lib/actions/databases'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'

// react-big-calendar's real Calendar does month-grid layout that needs
// browser APIs jsdom doesn't provide, and its rendering isn't CalendarView's
// own logic anyway. Stubbed to expose the mapped events and a way to invoke
// onSelectSlot/onSelectEvent directly, so this file tests CalendarView's
// event-mapping, row-creation, and navigation logic, not the third-party widget.
interface StubEvent { id: string; title: string; start: Date; resource: DatabaseRowWithTitle }
let capturedOnSelectSlot: ((slot: { start: Date; end: Date }) => void) | null = null

vi.mock('react-big-calendar', () => ({
  Calendar: ({ events, onSelectSlot, onSelectEvent }: {
    events: StubEvent[]
    onSelectSlot: (slot: { start: Date; end: Date }) => void
    onSelectEvent: (event: StubEvent) => void
  }) => {
    capturedOnSelectSlot = onSelectSlot
    return (
      <div data-testid="calendar-stub">
        {events.map(e => (
          <button key={e.id} onClick={() => onSelectEvent(e)}>{e.title} — {format(e.start, 'yyyy-MM-dd')}</button>
        ))}
      </div>
    )
  },
  dateFnsLocalizer: vi.fn(() => ({})),
}))

vi.mock('@/lib/actions/databases', () => ({
  createRow: vi.fn(),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const dateSchema: DatabaseField[] = [
  { id: 'due', name: 'Due Date', type: 'date' },
]

const rows: DatabaseRowWithTitle[] = [
  { id: 'row-1', database_id: 'db-1', page_id: 'p1', page_title: 'Task One', fields: { due: '2026-03-15' }, created_at: '' },
  { id: 'row-2', database_id: 'db-1', page_id: 'p2', page_title: null, fields: { due: '2026-03-20' }, created_at: '' },
  { id: 'row-3', database_id: 'db-1', page_id: 'p3', page_title: 'Empty Date Task', fields: { due: '' }, created_at: '' },
  { id: 'row-4', database_id: 'db-1', page_id: 'p4', page_title: 'No Field Task', fields: {}, created_at: '' },
  { id: 'row-5', database_id: 'db-1', page_id: null, page_title: 'Pageless Task', fields: { due: '2026-05-01' }, created_at: '' },
]

function renderCalendar(overrides: Partial<React.ComponentProps<typeof CalendarView>> = {}) {
  const onRowCreated = vi.fn()
  const utils = render(
    <CalendarView
      databaseId="db-1"
      workspaceId="ws-1"
      schema={dateSchema}
      rows={rows}
      onRowCreated={onRowCreated}
      {...overrides}
    />
  )
  return { onRowCreated, ...utils }
}

describe('CalendarView', () => {
  beforeEach(() => {
    capturedOnSelectSlot = null
    vi.mocked(createRow).mockReset()
    mockPush.mockReset()
  })

  it('shows a prompt instead of a calendar when the schema has no date field', () => {
    render(
      <CalendarView
        databaseId="db-1"
        workspaceId="ws-1"
        schema={[{ id: 'f1', name: 'Notes', type: 'text' }]}
        rows={rows}
        onRowCreated={vi.fn()}
      />
    )
    expect(screen.getByText('Add a Date field to use Calendar view.')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-stub')).not.toBeInTheDocument()
  })

  it('creates an event only for rows with a non-empty date value', () => {
    renderCalendar()
    expect(screen.getByText('Task One — 2026-03-15')).toBeInTheDocument()
    expect(screen.getByText('Untitled — 2026-03-20')).toBeInTheDocument()
    expect(screen.queryByText(/Empty Date Task/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No Field Task/)).not.toBeInTheDocument()
  })

  it('falls back to Untitled for a row with no page title', () => {
    renderCalendar()
    expect(screen.getByText('Untitled — 2026-03-20')).toBeInTheDocument()
  })

  it('creates a row with the selected date and reports it back on success', async () => {
    const createdRow = { ...rows[0], id: 'new-row', fields: { due: '2026-04-01' } }
    vi.mocked(createRow).mockResolvedValueOnce(createdRow)
    const { onRowCreated } = renderCalendar()

    capturedOnSelectSlot!({ start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-01T00:00:00') })

    await waitFor(() => {
      expect(createRow).toHaveBeenCalledWith('db-1', 'ws-1', { due: '2026-04-01' })
    })
    expect(onRowCreated).toHaveBeenCalledWith(createdRow)
  })

  it('shows an error message when creating a row from a selected slot fails', async () => {
    vi.mocked(createRow).mockRejectedValueOnce(new Error('boom'))
    renderCalendar()

    capturedOnSelectSlot!({ start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-01T00:00:00') })

    await waitFor(() => {
      expect(screen.getByText('Failed to create row')).toBeInTheDocument()
    })
  })

  it('clears a previous error once a later slot selection succeeds', async () => {
    vi.mocked(createRow).mockRejectedValueOnce(new Error('boom'))
    renderCalendar()

    capturedOnSelectSlot!({ start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-01T00:00:00') })
    await waitFor(() => {
      expect(screen.getByText('Failed to create row')).toBeInTheDocument()
    })

    vi.mocked(createRow).mockResolvedValueOnce({ ...rows[0], id: 'new-row-2' })
    capturedOnSelectSlot!({ start: new Date('2026-04-02T00:00:00'), end: new Date('2026-04-02T00:00:00') })

    await waitFor(() => {
      expect(screen.queryByText('Failed to create row')).not.toBeInTheDocument()
    })
  })

  it('navigates to the underlying page when an existing event is clicked', () => {
    renderCalendar()

    fireEvent.click(screen.getByText('Task One — 2026-03-15'))

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-1/page/p1')
  })

  it('does not navigate when the event has no associated page', () => {
    renderCalendar()

    fireEvent.click(screen.getByText('Pageless Task — 2026-05-01'))

    expect(mockPush).not.toHaveBeenCalled()
  })
})
