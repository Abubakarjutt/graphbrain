'use client'

import 'react-big-calendar/lib/css/react-big-calendar.css'

import { useTransition } from 'react'
import { Calendar, dateFnsLocalizer, SlotInfo } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { createRow } from '@/lib/actions/databases'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
})

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: DatabaseRowWithTitle
}

interface CalendarViewProps {
  databaseId: string
  workspaceId: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
  onRowCreated: (row: DatabaseRowWithTitle) => void
}

export function CalendarView({ databaseId, workspaceId, schema, rows, onRowCreated }: CalendarViewProps) {
  const [, startTransition] = useTransition()
  const dateField = schema.find(f => f.type === 'date')

  if (!dateField) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Add a Date field to use Calendar view.
      </div>
    )
  }

  const events: CalendarEvent[] = rows
    .filter(r => r.fields[dateField.id] != null && r.fields[dateField.id] !== '')
    .map(r => {
      const dateStr = String(r.fields[dateField.id])
      // Date strings from date inputs are YYYY-MM-DD — parse as local midnight
      const date = new Date(dateStr + 'T00:00:00')
      return {
        id: r.id,
        title: r.page_title || 'Untitled',
        start: date,
        end: date,
        resource: r,
      }
    })

  function handleSelectSlot(slot: SlotInfo) {
    const dateStr = format(slot.start, 'yyyy-MM-dd')
    startTransition(async () => {
      const row = await createRow(databaseId, workspaceId, { [dateField!.id]: dateStr })
      onRowCreated(row)
    })
  }

  return (
    <div className="flex-1 p-4" style={{ minHeight: '500px' }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        selectable
        onSelectSlot={handleSelectSlot}
        style={{ height: '100%' }}
        views={['month']}
        defaultView="month"
      />
    </div>
  )
}
