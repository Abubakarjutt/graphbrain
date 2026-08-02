'use client'

import 'react-big-calendar/lib/css/react-big-calendar.css'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, dateFnsLocalizer, SlotInfo } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import type { TodoBoard, TodoItemWithPage } from '@/lib/types/database'
import { createTodoItem } from '@/lib/actions/todos'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
})

type EventKind = 'created' | 'due'

interface TodoCalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: TodoItemWithPage
  kind: EventKind
}

interface CalendarViewProps {
  databaseId: string
  workspaceId: string
  board: TodoBoard
  onBoardChange: (board: TodoBoard) => void
}

// Date-only strings (YYYY-MM-DD, and the date portion of a timestamptz) must
// be parsed as local midnight, not UTC — otherwise the event can appear to
// land on the wrong day depending on the viewer's timezone offset.
function parseLocalDate(dateOnly: string): Date {
  return new Date(dateOnly + 'T00:00:00')
}

export function CalendarView({ databaseId, workspaceId, board, onBoardChange }: CalendarViewProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const events: TodoCalendarEvent[] = board.items.flatMap(item => {
    const created = parseLocalDate(item.created_at.slice(0, 10))
    const evts: TodoCalendarEvent[] = [
      { id: `${item.id}:created`, title: `Created: ${item.title}`, start: created, end: created, resource: item, kind: 'created' },
    ]
    if (item.due_date) {
      const due = parseLocalDate(item.due_date)
      evts.push({ id: `${item.id}:due`, title: `Due: ${item.title}`, start: due, end: due, resource: item, kind: 'due' })
    }
    return evts
  })

  function handleSelectEvent(event: TodoCalendarEvent) {
    if (event.resource.attached_page_id) {
      router.push(`/workspace/${workspaceId}/page/${event.resource.attached_page_id}`)
    }
  }

  function handleSelectSlot(slot: SlotInfo) {
    const firstList = [...board.lists].sort((a, b) => a.position - b.position)[0]
    if (!firstList) {
      setError('Add a list in Kanban view before creating to-do items here')
      return
    }
    const dateStr = format(slot.start, 'yyyy-MM-dd')
    startTransition(async () => {
      try {
        const item = await createTodoItem(firstList.id, databaseId, workspaceId, 'New to-do', dateStr)
        onBoardChange({ ...board, items: [...board.items, item] })
        setError(null)
      } catch {
        setError('Failed to create to-do item')
      }
    })
  }

  return (
    <div className="flex-1 p-4" style={{ minHeight: '500px' }}>
      {error && <p className="text-sm text-destructive pb-2">{error}</p>}
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        selectable
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={event => ({
          style: {
            backgroundColor: (event as TodoCalendarEvent).kind === 'due' ? '#d97706' : '#6b7280',
          },
        })}
        style={{ height: '100%' }}
        views={['month']}
        defaultView="month"
      />
    </div>
  )
}
