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
  onRename: (itemId: string, title: string) => void
  onSetDueDate: (itemId: string, dueDate: string | null) => void
  onDelete: (itemId: string) => void
  onAttach: (itemId: string, page: Page) => void
  onDetach: (itemId: string) => void
}

function TodoCard({ item, workspaceId, pages, onRename, onSetDueDate, onDelete, onAttach, onDetach }: TodoCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), opacity: isDragging ? 0.4 : 1 }
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [pickerOpen, setPickerOpen] = useState(false)

  function commitTitle() {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (trimmed && trimmed !== item.title) onRename(item.id, trimmed)
    else setTitleDraft(item.title)
  }

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
            onClose={() => setPickerOpen(false)}
          />
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
  onRenameList: (listId: string, name: string) => void
  onMoveList: (listId: string, direction: 'left' | 'right') => void
  onDeleteList: (listId: string) => void
  onAddItem: (listId: string, title: string) => void
  onRenameItem: (itemId: string, title: string) => void
  onSetDueDate: (itemId: string, dueDate: string | null) => void
  onDeleteItem: (itemId: string) => void
  onAttach: (itemId: string, page: Page) => void
  onDetach: (itemId: string) => void
}

function TodoListColumn({
  list, items, isFirst, isLast, workspaceId, pages,
  onRenameList, onMoveList, onDeleteList, onAddItem,
  onRenameItem, onSetDueDate, onDeleteItem, onAttach, onDetach,
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
            onRename={onRenameItem}
            onSetDueDate={onSetDueDate}
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
  onBoardChange: (board: TodoBoard) => void
}

export function KanbanView({ databaseId, workspaceId, board, pages, onBoardChange }: KanbanViewProps) {
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')

  const sortedLists = [...board.lists].sort((a, b) => a.position - b.position)

  function itemsForList(listId: string) {
    return board.items.filter(i => i.list_id === listId)
  }

  function handleAddList() {
    const name = newListName.trim()
    if (!name) return
    setNewListName('')
    startTransition(async () => {
      try {
        const list = await createTodoList(databaseId, workspaceId, name)
        onBoardChange({ ...board, lists: [...board.lists, list] })
        setError(null)
      } catch {
        setError('Failed to create list')
      }
    })
  }

  function handleRenameList(listId: string, name: string) {
    const previous = board.lists
    onBoardChange({ ...board, lists: board.lists.map(l => l.id === listId ? { ...l, name } : l) })
    startTransition(async () => {
      try {
        await renameTodoList(listId, databaseId, workspaceId, name)
        setError(null)
      } catch {
        onBoardChange({ ...board, lists: previous })
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
    const previous = board.lists
    onBoardChange({
      ...board,
      lists: board.lists.map(l => {
        if (l.id === a.id) return { ...l, position: b.position }
        if (l.id === b.id) return { ...l, position: a.position }
        return l
      }),
    })
    startTransition(async () => {
      try {
        await reorderTodoList(listId, databaseId, workspaceId, direction)
        setError(null)
      } catch {
        onBoardChange({ ...board, lists: previous })
        setError('Failed to move list')
      }
    })
  }

  function handleDeleteList(listId: string) {
    const previous = board
    onBoardChange({
      lists: board.lists.filter(l => l.id !== listId),
      items: board.items.filter(i => i.list_id !== listId),
    })
    startTransition(async () => {
      try {
        await deleteTodoList(listId, databaseId, workspaceId)
        setError(null)
      } catch {
        onBoardChange(previous)
        setError('Failed to delete list')
      }
    })
  }

  function handleAddItem(listId: string, title: string) {
    startTransition(async () => {
      try {
        const item = await createTodoItem(listId, databaseId, workspaceId, title)
        onBoardChange({ ...board, items: [...board.items, item] })
        setError(null)
      } catch {
        setError('Failed to create item')
      }
    })
  }

  function handleRenameItem(itemId: string, title: string) {
    const previous = board.items
    onBoardChange({ ...board, items: board.items.map(i => i.id === itemId ? { ...i, title } : i) })
    startTransition(async () => {
      try {
        await updateTodoItem(itemId, databaseId, workspaceId, { title })
        setError(null)
      } catch {
        onBoardChange({ ...board, items: previous })
        setError('Failed to rename item')
      }
    })
  }

  function handleSetDueDate(itemId: string, dueDate: string | null) {
    const previous = board.items
    onBoardChange({ ...board, items: board.items.map(i => i.id === itemId ? { ...i, due_date: dueDate } : i) })
    startTransition(async () => {
      try {
        await updateTodoItem(itemId, databaseId, workspaceId, { due_date: dueDate })
        setError(null)
      } catch {
        onBoardChange({ ...board, items: previous })
        setError('Failed to update due date')
      }
    })
  }

  function handleDeleteItem(itemId: string) {
    const previous = board.items
    onBoardChange({ ...board, items: board.items.filter(i => i.id !== itemId) })
    startTransition(async () => {
      try {
        await deleteTodoItem(itemId, databaseId, workspaceId)
        setError(null)
      } catch {
        onBoardChange({ ...board, items: previous })
        setError('Failed to delete item')
      }
    })
  }

  function handleAttach(itemId: string, page: Page) {
    const previous = board.items
    onBoardChange({
      ...board,
      items: board.items.map(i => i.id === itemId ? { ...i, attached_page_id: page.id, attached_page_title: page.title } : i),
    })
    startTransition(async () => {
      try {
        await attachPageToTodoItem(itemId, databaseId, workspaceId, page.id)
        setError(null)
      } catch {
        onBoardChange({ ...board, items: previous })
        setError('Failed to attach document')
      }
    })
  }

  function handleDetach(itemId: string) {
    const previous = board.items
    onBoardChange({
      ...board,
      items: board.items.map(i => i.id === itemId ? { ...i, attached_page_id: null, attached_page_title: null } : i),
    })
    startTransition(async () => {
      try {
        await attachPageToTodoItem(itemId, databaseId, workspaceId, null)
        setError(null)
      } catch {
        onBoardChange({ ...board, items: previous })
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

    const previous = board.items
    onBoardChange({ ...board, items: board.items.map(i => i.id === item.id ? { ...i, list_id: targetListId } : i) })
    startTransition(async () => {
      try {
        await updateTodoItem(item.id, databaseId, workspaceId, { list_id: targetListId })
        setError(null)
      } catch {
        onBoardChange({ ...board, items: previous })
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
              onRenameList={handleRenameList}
              onMoveList={handleMoveList}
              onDeleteList={handleDeleteList}
              onAddItem={handleAddItem}
              onRenameItem={handleRenameItem}
              onSetDueDate={handleSetDueDate}
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
