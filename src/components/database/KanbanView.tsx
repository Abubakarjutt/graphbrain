'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Page, TodoBoard, TodoItemWithPage, TodoList } from '@/lib/types/database'
import {
  createTodoList,
  renameTodoList,
  reorderTodoList,
  deleteTodoList,
  createTodoItem,
  updateTodoItem,
  deleteTodoItem,
  attachPageToTodoItem,
} from '@/lib/actions/todos'
import { TodoAttachDocumentPicker } from './TodoAttachDocumentPicker'

interface TodoCardProps {
  item: TodoItemWithPage
  workspaceId: string
  pages: Page[]
  lists: TodoList[]
  assignees: { id: string; email: string }[]
  onRename: (itemId: string, title: string) => void
  onSetDueDate: (itemId: string, dueDate: string | null) => void
  onAssign: (itemId: string, assigneeId: string | null) => void
  onDelete: (itemId: string) => void
  onAttach: (itemId: string, page: Page) => void
  onDetach: (itemId: string) => void
}

function TodoCard({ item, workspaceId, pages, assignees, lists, onRename, onSetDueDate, onAssign, onDelete, onAttach, onDetach }: TodoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), opacity: isDragging ? 0.4 : 1 }
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [movementOpen, setMovementOpen] = useState(false)

  function commitTitle() {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (trimmed && trimmed !== item.title) onRename(item.id, trimmed)
    else setTitleDraft(item.title)
  }

  function handleMoveTask(newListId: string) {
    onAssign(item.id, newListId)
    setMovementOpen(false)
  }

  function handleUnassignTask() {
    onAssign(item.id, null)
    setMovementOpen(false)
  }

  const currentList = lists.find(l => l.id === item.list_id)
  const otherLists = lists.filter(l => l.id !== item.list_id)

  return (
    <div ref={setNodeRef} style={style} className="bg-background border rounded-md p-3 shadow-sm space-y-2 select-none">
      <div
        {...attributes}
        {...listeners}
        className="w-6 h-1 bg-muted-foreground/30 rounded cursor-grab active:cursor-grabbing"
        aria-label="Drag handle"
      />
      {editingTitle ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={e => {
            if (e.key === 'Enter') commitTitle()
            if (e.key === 'Escape') { setTitleDraft(item.title); setEditingTitle(false) }
          }}
          aria-label={`Edit title for ${item.title}`}
          className="text-sm font-medium w-full bg-transparent outline-none border-b border-border"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          className="text-sm font-medium text-left w-full hover:underline"
        >
          {item.title}
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <input
          type="date"
          value={item.due_date ?? ''}
          onChange={e => onSetDueDate(item.id, e.target.value || null)}
          aria-label={`Due date for ${item.title}`}
          className="bg-transparent text-xs text-muted-foreground outline-none"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMovementOpen(true)}
            aria-label={`Move ${item.title}`}
            className="text-muted-foreground/50 hover:text-foreground text-xs flex items-center gap-1"
          >
            <span>Move</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4M7 4L3 8M7 4L11 8M17 16v-4m0 0l-4 4m4-4l-4-4" />
            </svg>
          </button>
          <div className="w-px h-4 bg-muted-foreground/20" />
          <button
            type="button"
            onClick={() => setAssignmentOpen(!assignmentOpen)}
            aria-label={`Assign ${item.title}`}
            className="text-muted-foreground/50 hover:text-foreground text-xs flex items-center gap-1"
          >
            {item.assignee?.email ? (
              <>
                <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                  {item.assignee.email[0].toUpperCase()}
                </span>
                <span className="truncate max-w-[50px]">{item.assignee.email.split('@')[0]}</span>
              </>
            ) : (
              <span className="text-xs">Assign</span>
            )}
          </button>
          {assignmentOpen && (
            <div className="absolute bottom-full left-0 mb-1 bg-background border rounded-md shadow-lg z-50 min-w-[150px]">
              <button
                type="button"
                onClick={() => { onAssign(item.id, null); setAssignmentOpen(false) }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted ${!item.assignee ? 'bg-muted' : ''}`}
              >
                <span className="text-muted-foreground">Unassign</span>
              </button>
              {assignees.map(assignee => (
                <button
                  key={assignee.id}
                  type="button"
                  onClick={() => { onAssign(item.id, assignee.id); setAssignmentOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2 ${item.assignee?.id === assignee.id ? 'bg-muted' : ''}`}
                >
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] flex-shrink-0">
                    {assignee.email[0].toUpperCase()}
                  </span>
                  <span className="truncate">{assignee.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          aria-label={`Delete ${item.title}`}
          className="text-muted-foreground/50 hover:text-destructive text-sm leading-none"
        >
          ×
        </button>
      </div>

      <div className="relative">
        {item.attached_page_id ? (
          <div className="flex items-center gap-1 text-xs">
            <Link
              href={`/workspace/${workspaceId}/page/${item.attached_page_id}`}
              className="text-accent-foreground hover:underline truncate"
              onClick={e => e.stopPropagation()}
            >
              {item.attached_page_title || 'Untitled'}
            </Link>
            <button
              type="button"
              onClick={() => onDetach(item.id)}
              aria-label={`Remove attached document from ${item.title}`}
              className="text-muted-foreground/50 hover:text-destructive"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            + Attach document
          </button>
        )}
        {pickerOpen && (
          <TodoAttachDocumentPicker
            pages={pages}
            onSelect={page => { onAttach(item.id, page); setPickerOpen(false) }}
            onClose={() => setPickerOpen(false) }
          />
        )}
        {/* Task Movement Modal */}
        {movementOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setMovementOpen(false)}>
            <div className="bg-background rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Move "{item.title}"</h3>
              <div className="space-y-2 mb-4">
                <p className="text-sm text-muted-foreground">Select a list to move this task to:</p>
                {otherLists.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No other lists available</p>
                ) : (
                  <div className="space-y-1">
                    {otherLists.map(list => (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => handleMoveTask(list.id)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-center justify-between"
                      >
                        <span>{list.name}</span>
                        <span className="text-xs text-muted-foreground">{list.position + 1}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleUnassignTask}
                  className="px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-md"
                >
                  Unassign
                </button>
                <button
                  type="button"
                  onClick={() => setMovementOpen(false)}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
                >
                  Cancel
                </button>
              </div>
              {currentList && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    Currently in: <span className="font-medium">{currentList.name}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface TodoListColumnProps {
  list: TodoList
  items: TodoItemWithPage[]
  isFirst: boolean
  isLast: boolean
  workspaceId: string
  pages: Page[]
  assignees: { id: string; email: string }[]
  onRenameList: (listId: string, name: string) => void
  onMoveList: (listId: string, direction: 'left' | 'right') => void
  onDeleteList: (listId: string) => void
  onAddItem: (listId: string, title: string) => void
  onRenameItem: (itemId: string, title: string) => void
  onSetDueDate: (itemId: string, dueDate: string | null) => void
  onAssignItem: (itemId: string, assigneeId: string | null) => void
  onDeleteItem: (itemId: string) => void
  onAttach: (itemId: string, page: Page) => void
  onDetach: (itemId: string) => void
}

function TodoListColumn({
  list, items, isFirst, isLast, workspaceId, pages, assignees,
  onRenameList, onMoveList, onDeleteList, onAddItem,
  onRenameItem, onSetDueDate, onAssignItem, onDeleteItem, onAttach, onDetach,
}: TodoListColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id })
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(list.name)
  const [newItemTitle, setNewItemTitle] = useState('')

  function commitRename() {
    const trimmed = nameDraft.trim()
    setRenaming(false)
    if (trimmed && trimmed !== list.name) onRenameList(list.id, trimmed)
    else setNameDraft(list.name)
  }

  function submitNewItem() {
    const trimmed = newItemTitle.trim()
    if (!trimmed) return
    onAddItem(list.id, trimmed)
    setNewItemTitle('')
  }

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-lg p-3 flex flex-col transition-colors ${isOver ? 'bg-accent/60 ring-2 ring-primary' : 'bg-muted/30'}`}
    >
      <div className="flex items-center gap-1 mb-3 px-1">
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => e.key === 'Enter' && commitRename()}
            aria-label={`Rename ${list.name}`}
            className="text-sm font-medium bg-transparent border-b border-border outline-none flex-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-sm font-medium text-muted-foreground flex-1 text-left truncate hover:text-foreground"
          >
            {list.name}
          </button>
        )}
        <button
          type="button"
          onClick={() => onMoveList(list.id, 'left')}
          disabled={isFirst}
          aria-label={`Move ${list.name} left`}
          className="disabled:opacity-30 text-muted-foreground hover:text-foreground text-xs"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => onMoveList(list.id, 'right')}
          disabled={isLast}
          aria-label={`Move ${list.name} right`}
          className="disabled:opacity-30 text-muted-foreground hover:text-foreground text-xs"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => onDeleteList(list.id)}
          aria-label={`Delete list ${list.name}`}
          className="text-muted-foreground/50 hover:text-destructive text-sm leading-none"
        >
          ×
        </button>
      </div>
      <div className="space-y-2 min-h-[80px] flex-1">
        {items.map(item => (
          <TodoCard
            key={item.id}
            item={item}
            workspaceId={workspaceId}
            pages={pages}
            lists={[list]}
              assignees={assignees}
            onRename={onRenameItem}
            onSetDueDate={onSetDueDate}
            onAssign={onAssignItem}
            onDelete={onDeleteItem}
            onAttach={onAttach}
            onDetach={onDetach}
          />
        ))}
      </div>
      <input
        value={newItemTitle}
        onChange={e => setNewItemTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submitNewItem()}
        placeholder="+ New"
        aria-label={`New item in ${list.name}`}
        className="mt-2 text-xs bg-transparent outline-none px-1 py-1 text-muted-foreground placeholder:text-muted-foreground/50"
      />
    </div>
  )
}

interface KanbanViewProps {
  databaseId: string
  workspaceId: string
  board: TodoBoard
  pages: Page[]
  onBoardChange: (update: TodoBoard | ((prev: TodoBoard) => TodoBoard)) => void
}

export function KanbanView({ databaseId, workspaceId, board, pages, onBoardChange }: KanbanViewProps) {
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const assignees = board.assignees ?? []

  const sortedLists = [...board.lists].sort((a, b) => a.position - b.position)

  function itemsForList(listId: string) {
    return board.items.filter(i => i.list_id === listId)
  }

  function handleAddList() {
    const name = newListName.trim()
    if (!name) return
    startTransition(async () => {
      try {
        const list = await createTodoList(databaseId, workspaceId, name)
        onBoardChange(prev => ({ ...prev, lists: [...prev.lists, list] }))
        setNewListName('')
        setError(null)
      } catch {
        setError('Failed to create list')
      }
    })
  }

  function handleRenameList(listId: string, name: string) {
    const originalName = board.lists.find(l => l.id === listId)?.name
    onBoardChange(prev => ({ ...prev, lists: prev.lists.map(l => l.id === listId ? { ...l, name } : l) }))
    startTransition(async () => {
      try {
        await renameTodoList(listId, databaseId, workspaceId, name)
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          lists: prev.lists.map(l => l.id === listId ? { ...l, name: originalName ?? l.name } : l),
        }))
        setError('Failed to rename list')
      }
    })
  }

  function handleMoveList(listId: string, direction: 'left' | 'right') {
    const idx = sortedLists.findIndex(l => l.id === listId)
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= sortedLists.length) return
    const a = sortedLists[idx]
    const b = sortedLists[swapIdx]
    onBoardChange(prev => ({
      ...prev,
      lists: prev.lists.map(l => {
        if (l.id === a.id) return { ...l, position: b.position }
        if (l.id === b.id) return { ...l, position: a.position }
        return l
      }),
    }))
    startTransition(async () => {
      try {
        await reorderTodoList(listId, databaseId, workspaceId, direction)
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          lists: prev.lists.map(l => {
            if (l.id === a.id) return { ...l, position: a.position }
            if (l.id === b.id) return { ...l, position: b.position }
            return l
          }),
        }))
        setError('Failed to move list')
      }
    })
  }

  function handleDeleteList(listId: string) {
    const deletedList = board.lists.find(l => l.id === listId)
    const deletedItems = board.items.filter(i => i.list_id === listId)
    onBoardChange(prev => ({
      ...prev,
      lists: prev.lists.filter(l => l.id !== listId),
      items: prev.items.filter(i => i.list_id !== listId),
     }))
    startTransition(async () => {
      try {
        await deleteTodoList(listId, databaseId, workspaceId)
        setError(null)
       } catch {
        if (deletedList) {
          onBoardChange(prev => ({
            ...prev,
            lists: [...prev.lists, deletedList],
            items: [...prev.items, ...deletedItems],
           }))
         }
        setError('Failed to delete list')
       }
     })
   }

  function handleAddItem(listId: string, title: string) {
    startTransition(async () => {
      try {
        const item = await createTodoItem(listId, databaseId, workspaceId, title)
        onBoardChange(prev => ({ ...prev, items: [...prev.items, item] }))
        setError(null)
      } catch {
        setError('Failed to create item')
      }
    })
  }

  function handleRenameItem(itemId: string, title: string) {
    const originalTitle = board.items.find(i => i.id === itemId)?.title
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, title } : i) }))
    startTransition(async () => {
      try {
        await updateTodoItem(itemId, databaseId, workspaceId, { title })
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === itemId ? { ...i, title: originalTitle ?? i.title } : i),
        }))
        setError('Failed to rename item')
      }
    })
  }

  function handleSetDueDate(itemId: string, dueDate: string | null) {
    const originalDueDate = board.items.find(i => i.id === itemId)?.due_date ?? null
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, due_date: dueDate } : i) }))
    startTransition(async () => {
      try {
        await updateTodoItem(itemId, databaseId, workspaceId, { due_date: dueDate })
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === itemId ? { ...i, due_date: originalDueDate } : i),
        }))
        setError('Failed to update due date')
      }
    })
  }

  function handleAssignItem(itemId: string, assigneeId: string | null) {
    const originalAssigneeId = board.items.find(i => i.id === itemId)?.assignee_id ?? null
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, assignee_id: assigneeId } : i) }))
    startTransition(async () => {
      try {
        await updateTodoItem(itemId, databaseId, workspaceId, { assignee_id: assigneeId })
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === itemId ? { ...i, assignee_id: originalAssigneeId } : i),
        }))
        setError('Failed to assign task')
      }
    })
  }

  function handleDeleteItem(itemId: string) {
    const deleteIndex = board.items.findIndex(i => i.id === itemId)
    const deletedItem = board.items[deleteIndex]
    onBoardChange(prev => ({ ...prev, items: prev.items.filter(i => i.id !== itemId) }))
    startTransition(async () => {
      try {
        await deleteTodoItem(itemId, databaseId, workspaceId)
        setError(null)
      } catch {
        if (deletedItem) {
          // Re-insert at its original index (not appended) so it reappears
          // where the user expects, not jumped to the bottom of the list.
          onBoardChange(prev => {
            const next = [...prev.items]
            next.splice(Math.min(deleteIndex, next.length), 0, deletedItem)
            return { ...prev, items: next }
          })
        }
        setError('Failed to delete item')
      }
    })
  }

  function handleAttach(itemId: string, page: Page) {
    const original = board.items.find(i => i.id === itemId)
    onBoardChange(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_id: page.id, attached_page_title: page.title } : i),
    }))
    startTransition(async () => {
      try {
        // Reconcile with the server-verified title rather than trusting the
        // client-supplied `page.title` (sourced from a `pages` list fetched
        // once at server-render time, so it could be stale by now).
        const { title } = await attachPageToTodoItem(itemId, databaseId, workspaceId, page.id)
        onBoardChange(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_title: title } : i),
        }))
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === itemId
            ? { ...i, attached_page_id: original?.attached_page_id ?? null, attached_page_title: original?.attached_page_title ?? null }
            : i),
        }))
        setError('Failed to attach document')
      }
    })
  }

  function handleDetach(itemId: string) {
    const original = board.items.find(i => i.id === itemId)
    onBoardChange(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_id: null, attached_page_title: null } : i),
    }))
    startTransition(async () => {
      try {
        await attachPageToTodoItem(itemId, databaseId, workspaceId, null)
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === itemId
            ? { ...i, attached_page_id: original?.attached_page_id ?? null, attached_page_title: original?.attached_page_title ?? null }
            : i),
        }))
        setError('Failed to remove attached document')
      }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const item = board.items.find(i => i.id === String(active.id))
    if (!item) return
    const targetListId = String(over.id)
    // Cards have no explicit order within a list — a drop within the same
    // list the card is already in is a no-op rather than a reorder.
    if (item.list_id === targetListId) return
    if (!board.lists.some(l => l.id === targetListId)) return

    const originalListId = item.list_id
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, list_id: targetListId } : i) }))
    startTransition(async () => {
      try {
        await updateTodoItem(item.id, databaseId, workspaceId, { list_id: targetListId })
        setError(null)
      } catch {
        onBoardChange(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === item.id ? { ...i, list_id: originalListId } : i),
        }))
        setError('Failed to move item')
      }
    })
  }

  return (
    <div className="flex flex-col h-full">
      {error && <p className="text-sm text-destructive px-4 pt-2">{error}</p>}
      <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-4 h-full overflow-x-auto">
          {sortedLists.map((list, idx) => (
            <TodoListColumn
              key={list.id}
              list={list}
              items={itemsForList(list.id)}
              isFirst={idx === 0}
              isLast={idx === sortedLists.length - 1}
              workspaceId={workspaceId}
              pages={pages}
              assignees={assignees}
              onRenameList={handleRenameList}
              onMoveList={handleMoveList}
              onDeleteList={handleDeleteList}
              onAddItem={handleAddItem}
              onRenameItem={handleRenameItem}
              onSetDueDate={handleSetDueDate}
              onAssignItem={handleAssignItem}
              onDeleteItem={handleDeleteItem}
              onAttach={handleAttach}
              onDetach={handleDetach}
            />
          ))}
          <div className="w-64 shrink-0 rounded-lg p-3 bg-muted/10 border border-dashed border-border/60 h-fit">
            <input
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddList()}
              placeholder="+ Add list"
              aria-label="New list name"
              className="w-full text-sm bg-transparent outline-none text-muted-foreground placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
      </DndContext>
    </div>
  )
}
