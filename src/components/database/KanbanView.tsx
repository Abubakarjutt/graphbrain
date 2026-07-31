'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'
import { updateRowFields } from '@/lib/actions/databases'

// Sentinel used as the droppable ID for the "No Status" column
const NO_STATUS_ID = '__no_status__'

interface KanbanCardProps {
  row: DatabaseRowWithTitle
  workspaceId: string
}

function KanbanCard({ row, workspaceId }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="bg-background border rounded-md p-3 shadow-sm select-none"
    >
      <div
        {...listeners}
        className="w-6 h-1 bg-muted-foreground/30 rounded mb-2 cursor-grab active:cursor-grabbing"
        aria-label="Drag handle"
      />
      {row.page_id ? (
        <Link
          href={`/workspace/${workspaceId}/page/${row.page_id}`}
          className="text-sm font-medium hover:underline"
          onClick={e => e.stopPropagation()}
        >
          {row.page_title || 'Untitled'}
        </Link>
      ) : (
        <span className="text-sm font-medium">{row.page_title || 'Untitled'}</span>
      )}
    </div>
  )
}

interface KanbanColumnProps {
  id: string
  label: string
  rows: DatabaseRowWithTitle[]
  workspaceId: string
}

function KanbanColumn({ id, label, rows, workspaceId }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-lg p-3 transition-colors ${isOver ? 'bg-accent/60 ring-2 ring-primary' : 'bg-muted/30'}`}
    >
      <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">{label}</h3>
      <div className="space-y-2 min-h-[80px]">
        {rows.map(row => (
          <KanbanCard key={row.id} row={row} workspaceId={workspaceId} />
        ))}
      </div>
    </div>
  )
}

interface KanbanViewProps {
  databaseId: string
  workspaceId: string
  schema: DatabaseField[]
  rows: DatabaseRowWithTitle[]
  onRowUpdate: (rowId: string, fields: Record<string, unknown>) => void
}

export function KanbanView({ databaseId, workspaceId, schema, rows, onRowUpdate }: KanbanViewProps) {
  const [, startTransition] = useTransition()
  const selectField = schema.find(f => f.type === 'select')

  if (!selectField) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Add a Select field to use Kanban view.
      </div>
    )
  }

  const options = selectField.options ?? []
  const columns = [
    { id: NO_STATUS_ID, label: 'No Status' },
    ...options.map(o => ({ id: o, label: o })),
  ]

  function getColumnRows(columnId: string) {
    return rows.filter(r => {
      const val = r.fields[selectField!.id]
      if (columnId === NO_STATUS_ID) return val === null || val === undefined || val === ''
      return val === columnId
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const newOptionValue = over.id === NO_STATUS_ID ? null : String(over.id)
    const row = rows.find(r => r.id === String(active.id))
    if (!row) return

    const currentValue = row.fields[selectField!.id]
    const isAlreadyInColumn =
      over.id === NO_STATUS_ID
        ? currentValue === null || currentValue === undefined || currentValue === ''
        : currentValue === over.id
    if (isAlreadyInColumn) return

    const originalFields = { ...row.fields }
    const newFields = { ...row.fields, [selectField!.id]: newOptionValue }
    onRowUpdate(String(active.id), newFields)
    startTransition(async () => {
      try {
        await updateRowFields(String(active.id), databaseId, workspaceId, newFields)
      } catch {
        onRowUpdate(String(active.id), originalFields)
      }
    })
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-4 h-full overflow-x-auto">
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            rows={getColumnRows(col.id)}
            workspaceId={workspaceId}
          />
        ))}
      </div>
    </DndContext>
  )
}
