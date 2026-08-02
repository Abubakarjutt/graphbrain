import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KanbanView } from '@/components/database/KanbanView'
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
import type { Page, TodoBoard, TodoList } from '@/lib/types/database'

type DragEvent = { active: { id: string }; over: { id: string } | null }
let capturedOnDragEnd: ((event: DragEvent) => void) | null = null

// Real @dnd-kit drag physics aren't testable in jsdom (no pointer capture) and
// aren't KanbanView's own logic anyway. DndContext is stubbed to capture the
// onDragEnd callback so it can be invoked directly with a synthetic event.
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

const lists: TodoList[] = [
  { id: 'list-1', database_id: 'db-1', name: 'To Do', position: 0, created_at: '' },
  { id: 'list-2', database_id: 'db-1', name: 'Done', position: 1, created_at: '' },
]

const board: TodoBoard = {
  lists,
  items: [
    { id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Write report', due_date: null, attached_page_id: null, attached_page_title: null, created_at: '' },
    { id: 'item-2', database_id: 'db-1', list_id: 'list-2', title: 'Ship it', due_date: '2026-01-01', attached_page_id: 'page-1', attached_page_title: 'Launch Notes', created_at: '' },
  ],
}

const pages: Page[] = [
  { id: 'page-2', workspace_id: 'ws-1', parent_id: null, title: 'Design Doc', created_by: 'u1', created_at: '', updated_at: '' },
]

function renderBoard(overrides: Partial<React.ComponentProps<typeof KanbanView>> = {}) {
  const onBoardChange = vi.fn()
  const utils = render(
    <KanbanView
      databaseId="db-1"
      workspaceId="ws-1"
      board={board}
      pages={pages}
      onBoardChange={onBoardChange}
      {...overrides}
    />
  )
  return { onBoardChange, ...utils }
}

// onBoardChange now takes either a plain board or a React-setState-style
// updater function (to fix a lost-update bug where two concurrent edits
// closing over a stale `board` could clobber each other). This replays every
// captured call, in order, against a starting board — exactly how React
// would apply them — so assertions see the real final state regardless of
// whether a given call used the plain or functional form.
type BoardUpdate = TodoBoard | ((prev: TodoBoard) => TodoBoard)

function applyAllChanges(onBoardChange: ReturnType<typeof vi.fn<(update: BoardUpdate) => void>>, base: TodoBoard): TodoBoard {
  return onBoardChange.mock.calls.reduce(
    (acc: TodoBoard, [arg]: [BoardUpdate]) => typeof arg === 'function' ? arg(acc) : arg,
    base
  )
}

describe('KanbanView', () => {
  beforeEach(() => {
    capturedOnDragEnd = null
    vi.mocked(createTodoList).mockReset().mockResolvedValue({ id: 'new-list', database_id: 'db-1', name: 'New List', position: 2, created_at: '' })
    vi.mocked(renameTodoList).mockReset().mockResolvedValue(undefined)
    vi.mocked(reorderTodoList).mockReset().mockResolvedValue(undefined)
    vi.mocked(deleteTodoList).mockReset().mockResolvedValue(undefined)
    vi.mocked(createTodoItem).mockReset().mockResolvedValue({ id: 'new-item', database_id: 'db-1', list_id: 'list-1', title: 'New', due_date: null, attached_page_id: null, attached_page_title: null, created_at: '' })
    vi.mocked(updateTodoItem).mockReset().mockResolvedValue(undefined)
    vi.mocked(deleteTodoItem).mockReset().mockResolvedValue(undefined)
    vi.mocked(attachPageToTodoItem).mockReset().mockResolvedValue({ title: null })
  })

  it('renders each list with its items', () => {
    renderBoard()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Write report')).toBeInTheDocument()
    expect(screen.getByText('Ship it')).toBeInTheDocument()
  })

  it('renders lists in position order', () => {
    renderBoard({ board: { ...board, lists: [lists[1], lists[0]] } })
    const headers = screen.getAllByText(/To Do|Done/).map(el => el.textContent)
    expect(headers).toEqual(['To Do', 'Done'])
  })

  it('shows an "+ Add list" input that creates a new list on Enter', async () => {
    const { onBoardChange } = renderBoard()
    const input = screen.getByLabelText('New list name')
    fireEvent.change(input, { target: { value: 'Backlog' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(createTodoList).toHaveBeenCalledWith('db-1', 'ws-1', 'Backlog')
    })
    expect(applyAllChanges(onBoardChange, board).lists).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'new-list' })])
    )
  })

  it('does not create a list from a blank name', () => {
    renderBoard()
    fireEvent.keyDown(screen.getByLabelText('New list name'), { key: 'Enter' })
    expect(createTodoList).not.toHaveBeenCalled()
  })

  it('does not lose an earlier list add when a second add resolves first', async () => {
    // Regression test: onBoardChange handlers used to close over the `board`
    // captured at render time, so if list B's create request resolved before
    // list A's, B's completion would rebuild the board from a snapshot that
    // never included A — silently dropping it. The functional-update form
    // fixes this by always merging into whatever the current state actually
    // is when each call lands, not a stale render-time snapshot.
    let resolveA: (list: TodoList) => void
    vi.mocked(createTodoList).mockReturnValueOnce(new Promise(resolve => { resolveA = resolve }))
    const { onBoardChange } = renderBoard()

    const input = screen.getByLabelText('New list name')
    fireEvent.change(input, { target: { value: 'List A' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    vi.mocked(createTodoList).mockResolvedValueOnce({ id: 'list-b', database_id: 'db-1', name: 'List B', position: 3, created_at: '' })
    fireEvent.change(input, { target: { value: 'List B' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onBoardChange).toHaveBeenCalledTimes(1))
    resolveA!({ id: 'list-a', database_id: 'db-1', name: 'List A', position: 2, created_at: '' })

    await waitFor(() => expect(onBoardChange).toHaveBeenCalledTimes(2))
    const finalLists = applyAllChanges(onBoardChange, board).lists.map(l => l.id)
    expect(finalLists).toEqual(expect.arrayContaining(['list-a', 'list-b']))
  })

  it('renames a list when its name is clicked, edited, and committed with Enter', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('To Do'))
    const input = screen.getByLabelText('Rename To Do')
    fireEvent.change(input, { target: { value: 'In Progress' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(applyAllChanges(onBoardChange, board).lists).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'list-1', name: 'In Progress' })])
    )
    await waitFor(() => {
      expect(renameTodoList).toHaveBeenCalledWith('list-1', 'db-1', 'ws-1', 'In Progress')
    })
  })

  it('reverts a list rename when the persist fails', async () => {
    vi.mocked(renameTodoList).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('To Do'))
    const input = screen.getByLabelText('Rename To Do')
    fireEvent.change(input, { target: { value: 'In Progress' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).lists).toEqual(lists)
    })
    expect(screen.getByText('Failed to rename list')).toBeInTheDocument()
  })

  it('disables the left arrow on the first list and the right arrow on the last', () => {
    renderBoard()
    expect(screen.getByLabelText('Move To Do left')).toBeDisabled()
    expect(screen.getByLabelText('Move To Do right')).not.toBeDisabled()
    expect(screen.getByLabelText('Move Done left')).not.toBeDisabled()
    expect(screen.getByLabelText('Move Done right')).toBeDisabled()
  })

  it('swaps two lists\' positions when the move-right arrow is clicked', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Move To Do right'))

    expect(applyAllChanges(onBoardChange, board).lists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'list-1', position: 1 }),
        expect.objectContaining({ id: 'list-2', position: 0 }),
      ])
    )
    await waitFor(() => {
      expect(reorderTodoList).toHaveBeenCalledWith('list-1', 'db-1', 'ws-1', 'right')
    })
  })

  it('reverts a list move when the persist fails, restoring only the two swapped positions', async () => {
    vi.mocked(reorderTodoList).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Move To Do right'))

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).lists).toEqual(lists)
    })
    expect(screen.getByText('Failed to move list')).toBeInTheDocument()
  })

  it('deletes a list and its items together', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Delete list To Do'))

    expect(applyAllChanges(onBoardChange, board)).toEqual({
      lists: [lists[1]],
      items: [board.items[1]],
    })
    await waitFor(() => {
      expect(deleteTodoList).toHaveBeenCalledWith('list-1', 'db-1', 'ws-1')
    })
  })

  it('reverts list deletion when the persist fails', async () => {
    vi.mocked(deleteTodoList).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Delete list To Do'))

    // The restored list/items are appended rather than spliced back at their
    // original array index — harmless since rendering groups items by
    // list_id and orders lists by their (also-restored) position field, so
    // compare by membership rather than exact array order.
    await waitFor(() => {
      const result = applyAllChanges(onBoardChange, board)
      expect(result.lists).toEqual(expect.arrayContaining(board.lists))
      expect(result.items).toEqual(expect.arrayContaining(board.items))
      expect(result.lists).toHaveLength(board.lists.length)
      expect(result.items).toHaveLength(board.items.length)
    })
    expect(screen.getByText('Failed to delete list')).toBeInTheDocument()
  })

  it('adds a new item to a list via its "+ New" input', async () => {
    const { onBoardChange } = renderBoard()
    const input = screen.getByLabelText('New item in To Do')
    fireEvent.change(input, { target: { value: 'Draft outline' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(createTodoItem).toHaveBeenCalledWith('list-1', 'db-1', 'ws-1', 'Draft outline')
    })
    expect(applyAllChanges(onBoardChange, board).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'new-item' })])
    )
    expect(input).toHaveValue('')
  })

  it('does not add an item from a blank title', () => {
    renderBoard()
    fireEvent.keyDown(screen.getByLabelText('New item in To Do'), { key: 'Enter' })
    expect(createTodoItem).not.toHaveBeenCalled()
  })

  it('renames an item when its title is clicked, edited, and committed with Enter', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('Write report'))
    const input = screen.getByLabelText('Edit title for Write report')
    fireEvent.change(input, { target: { value: 'Write final report' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(applyAllChanges(onBoardChange, board).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'item-1', title: 'Write final report' })])
    )
    await waitFor(() => {
      expect(updateTodoItem).toHaveBeenCalledWith('item-1', 'db-1', 'ws-1', { title: 'Write final report' })
    })
  })

  it('reverts an item rename when the persist fails', async () => {
    vi.mocked(updateTodoItem).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('Write report'))
    const input = screen.getByLabelText('Edit title for Write report')
    fireEvent.change(input, { target: { value: 'Something else' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).items).toEqual(board.items)
    })
    expect(screen.getByText('Failed to rename item')).toBeInTheDocument()
  })

  it('cancels an in-progress title edit on Escape without committing', () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('Write report'))
    const input = screen.getByLabelText('Edit title for Write report')
    fireEvent.change(input, { target: { value: 'Something else' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.getByText('Write report')).toBeInTheDocument()
    expect(onBoardChange).not.toHaveBeenCalled()
  })

  it('updates an item\'s due date', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.change(screen.getByLabelText('Due date for Write report'), { target: { value: '2026-03-01' } })

    expect(applyAllChanges(onBoardChange, board).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'item-1', due_date: '2026-03-01' })])
    )
    await waitFor(() => {
      expect(updateTodoItem).toHaveBeenCalledWith('item-1', 'db-1', 'ws-1', { due_date: '2026-03-01' })
    })
  })

  it('deletes an item', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Delete Write report'))

    expect(applyAllChanges(onBoardChange, board).items).toEqual([board.items[1]])
    await waitFor(() => {
      expect(deleteTodoItem).toHaveBeenCalledWith('item-1', 'db-1', 'ws-1')
    })
  })

  it('reverts item deletion when the persist fails', async () => {
    vi.mocked(deleteTodoItem).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Delete Write report'))

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).items).toEqual(board.items)
    })
    expect(screen.getByText('Failed to delete item')).toBeInTheDocument()
  })

  it('shows the attached document as a link with a way to remove it', () => {
    renderBoard()
    const link = screen.getByText('Launch Notes').closest('a')
    expect(link).toHaveAttribute('href', '/workspace/ws-1/page/page-1')
    expect(screen.getByLabelText('Remove attached document from Ship it')).toBeInTheDocument()
  })

  it('opens a document picker and optimistically attaches the selected page', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('+ Attach document'))
    fireEvent.click(screen.getByText('Design Doc'))

    expect(applyAllChanges(onBoardChange, board).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'item-1', attached_page_id: 'page-2', attached_page_title: 'Design Doc' })])
    )
    await waitFor(() => {
      expect(attachPageToTodoItem).toHaveBeenCalledWith('item-1', 'db-1', 'ws-1', 'page-2')
    })
  })

  it('reconciles the optimistic title with the server-verified title once the attach succeeds', async () => {
    vi.mocked(attachPageToTodoItem).mockResolvedValueOnce({ title: 'Server-Verified Title' })
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('+ Attach document'))
    fireEvent.click(screen.getByText('Design Doc'))

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'item-1', attached_page_title: 'Server-Verified Title' })])
      )
    })
  })

  it('reverts an attach when the persist fails', async () => {
    vi.mocked(attachPageToTodoItem).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByText('+ Attach document'))
    fireEvent.click(screen.getByText('Design Doc'))

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).items).toEqual(board.items)
    })
    expect(screen.getByText('Failed to attach document')).toBeInTheDocument()
  })

  it('detaches a document when its remove button is clicked', async () => {
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Remove attached document from Ship it'))

    expect(applyAllChanges(onBoardChange, board).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'item-2', attached_page_id: null, attached_page_title: null })])
    )
    await waitFor(() => {
      expect(attachPageToTodoItem).toHaveBeenCalledWith('item-2', 'db-1', 'ws-1', null)
    })
  })

  it('reverts a detach when the persist fails', async () => {
    vi.mocked(attachPageToTodoItem).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    fireEvent.click(screen.getByLabelText('Remove attached document from Ship it'))

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).items).toEqual(board.items)
    })
    expect(screen.getByText('Failed to remove attached document')).toBeInTheDocument()
  })

  it('moves a card to another list on drag end', async () => {
    const { onBoardChange } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'item-1' }, over: { id: 'list-2' } })

    expect(applyAllChanges(onBoardChange, board).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'item-1', list_id: 'list-2' })])
    )
    await waitFor(() => {
      expect(updateTodoItem).toHaveBeenCalledWith('item-1', 'db-1', 'ws-1', { list_id: 'list-2' })
    })
  })

  it('does nothing when a card is dropped back onto the list it is already in', () => {
    const { onBoardChange } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'item-1' }, over: { id: 'list-1' } })
    expect(onBoardChange).not.toHaveBeenCalled()
    expect(updateTodoItem).not.toHaveBeenCalled()
  })

  it('does nothing when dropped outside any list', () => {
    const { onBoardChange } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'item-1' }, over: null })
    expect(onBoardChange).not.toHaveBeenCalled()
  })

  it('does nothing and does not crash when the dragged item id is unknown', () => {
    const { onBoardChange } = renderBoard()
    expect(() => capturedOnDragEnd!({ active: { id: 'ghost' }, over: { id: 'list-2' } })).not.toThrow()
    expect(onBoardChange).not.toHaveBeenCalled()
  })

  it('does nothing when dropped onto a target id that is not one of the board\'s lists', () => {
    const { onBoardChange } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'item-1' }, over: { id: 'not-a-real-list' } })
    expect(onBoardChange).not.toHaveBeenCalled()
    expect(updateTodoItem).not.toHaveBeenCalled()
  })

  it('reverts a card move when the persist fails', async () => {
    vi.mocked(updateTodoItem).mockRejectedValueOnce(new Error('boom'))
    const { onBoardChange } = renderBoard()
    capturedOnDragEnd!({ active: { id: 'item-1' }, over: { id: 'list-2' } })

    await waitFor(() => {
      expect(applyAllChanges(onBoardChange, board).items).toEqual(board.items)
    })
    expect(screen.getByText('Failed to move item')).toBeInTheDocument()
  })
})
