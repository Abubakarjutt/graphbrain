import { describe, it, expect, vi, beforeEach } from 'vitest'

// todos.ts calls a variety of chain shapes against 'databases', 'pages',
// 'todo_lists', and 'todo_items' (select/insert/update/delete, with 0-2
// .eq()s, optional .order()/.limit()/.in(), and a terminal .single() or a
// bare await). Rather than hand-rolling one mock object per exact shape,
// each table gets a thenable builder: every chain method returns the same
// builder, and awaiting it resolves to whatever the table's `resolver`
// queue currently returns — mirroring how the real supabase-js builder is
// simultaneously chainable and awaitable at every step.
type TableResolver = ReturnType<typeof vi.fn<() => unknown>>

function makeTableResolvers() {
  const resolvers: Record<string, TableResolver> = {}
  function builderFor(table: string) {
    if (!resolvers[table]) resolvers[table] = vi.fn<() => unknown>().mockReturnValue({ data: null, error: null })
    const resolver = resolvers[table]
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      in: vi.fn(() => builder),
      single: vi.fn(() => builder),
      then: (resolve: (v: unknown) => void) => resolve(resolver()),
    }
    return builder
  }
  return { resolvers, builderFor }
}

const { resolvers, builderFor } = makeTableResolvers()
const mockFrom = vi.fn((table: string) => builderFor(table))
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: mockFrom,
    rpc: mockRpc,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function queueOnce(table: string, value: unknown) {
  if (!resolvers[table]) resolvers[table] = vi.fn<() => unknown>().mockReturnValue({ data: null, error: null })
  resolvers[table].mockReturnValueOnce(value)
}

// Every action calls assertDatabaseAccess first: databases select (found),
// then pages select scoped to workspace_id (found). Queue both as passing.
function queueAccessGranted() {
  queueOnce('databases', { data: { id: 'db-1', page_id: 'page-1' }, error: null })
  queueOnce('pages', { data: { id: 'page-1' }, error: null })
}

describe('todo actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    for (const key of Object.keys(resolvers)) delete resolvers[key]
    mockRpc.mockReset()
  })

  describe('assertDatabaseAccess (via getTodoBoard)', () => {
    it('throws when the database does not exist', async () => {
      queueOnce('databases', { data: null, error: null })
      const { getTodoBoard } = await import('@/lib/actions/todos')
      await expect(getTodoBoard('db-1', 'ws-1')).rejects.toThrow('Database not found or access denied')
    })

    it('throws when the container page is not in the given workspace', async () => {
      queueOnce('databases', { data: { id: 'db-1', page_id: 'page-1' }, error: null })
      queueOnce('pages', { data: null, error: null })
      const { getTodoBoard } = await import('@/lib/actions/todos')
      await expect(getTodoBoard('db-1', 'ws-1')).rejects.toThrow('Database not found or access denied')
    })
  })

  describe('getTodoBoard', () => {
    it('returns lists and items with attached page titles resolved', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: [{ id: 'list-1', database_id: 'db-1', name: 'To Do', position: 0, created_at: '' }], error: null })
      queueOnce('todo_items', {
        data: [{ id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Task', due_date: null, attached_page_id: 'page-2', created_at: '' }],
        error: null,
      })
      queueOnce('pages', { data: [{ id: 'page-2', title: 'Attached Doc' }], error: null })

      const { getTodoBoard } = await import('@/lib/actions/todos')
      const board = await getTodoBoard('db-1', 'ws-1')

      expect(board.lists).toHaveLength(1)
      expect(board.items[0]).toMatchObject({ id: 'item-1', attached_page_title: 'Attached Doc' })
    })

    it('falls back to "Untitled" for an attached page whose title lookup returns nothing', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: [], error: null })
      queueOnce('todo_items', {
        data: [{ id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Task', due_date: null, attached_page_id: 'page-2', created_at: '' }],
        error: null,
      })
      queueOnce('pages', { data: [], error: null })

      const { getTodoBoard } = await import('@/lib/actions/todos')
      const board = await getTodoBoard('db-1', 'ws-1')

      expect(board.items[0].attached_page_title).toBe('Untitled')
    })
  })

  describe('createTodoList', () => {
    it('assigns the next position after the current highest', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: [{ position: 3 }], error: null })
      queueOnce('todo_lists', { data: { id: 'list-2', database_id: 'db-1', name: 'Done', position: 4, created_at: '' }, error: null })

      const { createTodoList } = await import('@/lib/actions/todos')
      const list = await createTodoList('db-1', 'ws-1', 'Done')

      expect(list.position).toBe(4)
    })

    it('assigns position 0 when there are no existing lists', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: [], error: null })
      queueOnce('todo_lists', { data: { id: 'list-1', database_id: 'db-1', name: 'To Do', position: 0, created_at: '' }, error: null })

      const { createTodoList } = await import('@/lib/actions/todos')
      const list = await createTodoList('db-1', 'ws-1', 'To Do')

      expect(list.position).toBe(0)
    })
  })

  describe('reorderTodoList', () => {
    it('does nothing when moving the first list left', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', {
        data: [{ id: 'list-1', position: 0 }, { id: 'list-2', position: 1 }],
        error: null,
      })

      const { reorderTodoList } = await import('@/lib/actions/todos')
      await reorderTodoList('list-1', 'db-1', 'ws-1', 'left')

      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('does nothing when moving the last list right', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', {
        data: [{ id: 'list-1', position: 0 }, { id: 'list-2', position: 1 }],
        error: null,
      })

      const { reorderTodoList } = await import('@/lib/actions/todos')
      await reorderTodoList('list-2', 'db-1', 'ws-1', 'right')

      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('throws when the list is not found among the database\'s lists', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: [{ id: 'list-2', position: 0 }], error: null })

      const { reorderTodoList } = await import('@/lib/actions/todos')
      await expect(reorderTodoList('ghost', 'db-1', 'ws-1', 'left')).rejects.toThrow('List not found')
    })

    it('swaps two lists atomically via a single RPC call, scoped to the database', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', {
        data: [{ id: 'list-1', position: 0 }, { id: 'list-2', position: 1 }],
        error: null,
      })
      mockRpc.mockResolvedValueOnce({ error: null })

      const { reorderTodoList } = await import('@/lib/actions/todos')
      await reorderTodoList('list-1', 'db-1', 'ws-1', 'right')

      expect(mockRpc).toHaveBeenCalledWith('swap_todo_list_positions', {
        id_a: 'list-1', id_b: 'list-2', target_database_id: 'db-1',
      })
    })

    it('propagates an error when the swap RPC fails', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', {
        data: [{ id: 'list-1', position: 0 }, { id: 'list-2', position: 1 }],
        error: null,
      })
      mockRpc.mockResolvedValueOnce({ error: { message: 'constraint violation' } })

      const { reorderTodoList } = await import('@/lib/actions/todos')
      await expect(reorderTodoList('list-1', 'db-1', 'ws-1', 'right')).rejects.toThrow('constraint violation')
    })
  })

  describe('createTodoItem', () => {
    it('throws when the target list does not belong to the given database', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: null, error: null })

      const { createTodoItem } = await import('@/lib/actions/todos')
      await expect(createTodoItem('other-db-list', 'db-1', 'ws-1', 'Task')).rejects.toThrow('List not found')
    })

    it('creates the item when the list belongs to the database', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: { id: 'list-1' }, error: null })
      queueOnce('todo_items', {
        data: { id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Task', due_date: null, attached_page_id: null, created_at: '' },
        error: null,
      })

      const { createTodoItem } = await import('@/lib/actions/todos')
      const item = await createTodoItem('list-1', 'db-1', 'ws-1', 'Task')

      expect(item.id).toBe('item-1')
      expect(item.attached_page_title).toBeNull()
    })
  })

  describe('updateTodoItem', () => {
    it('throws when moving an item to a list that does not belong to the database', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: null, error: null })

      const { updateTodoItem } = await import('@/lib/actions/todos')
      await expect(updateTodoItem('item-1', 'db-1', 'ws-1', { list_id: 'other-db-list' })).rejects.toThrow('List not found')
    })

    it('does not check list ownership when the patch does not move the item to a new list', async () => {
      queueAccessGranted()
      queueOnce('todo_items', { data: null, error: null })

      const { updateTodoItem } = await import('@/lib/actions/todos')
      await expect(updateTodoItem('item-1', 'db-1', 'ws-1', { title: 'New title' })).resolves.toBeUndefined()
    })
  })

  describe('attachPageToTodoItem', () => {
    it('throws when the page does not exist in the given workspace', async () => {
      queueAccessGranted()
      queueOnce('pages', { data: null, error: null })

      const { attachPageToTodoItem } = await import('@/lib/actions/todos')
      await expect(attachPageToTodoItem('item-1', 'db-1', 'ws-1', 'page-2')).rejects.toThrow('Page not found or access denied')
    })

    it('returns the server-verified title on success', async () => {
      queueAccessGranted()
      queueOnce('pages', { data: { id: 'page-2', title: 'Real Title' }, error: null })
      queueOnce('todo_items', { data: null, error: null })

      const { attachPageToTodoItem } = await import('@/lib/actions/todos')
      const result = await attachPageToTodoItem('item-1', 'db-1', 'ws-1', 'page-2')

      expect(result).toEqual({ title: 'Real Title' })
    })

    it('detaches without a page lookup when pageId is null', async () => {
      queueAccessGranted()
      queueOnce('todo_items', { data: null, error: null })

      const { attachPageToTodoItem } = await import('@/lib/actions/todos')
      const result = await attachPageToTodoItem('item-1', 'db-1', 'ws-1', null)

      expect(result).toEqual({ title: null })
    })
  })

  describe('deleteTodoList / deleteTodoItem / renameTodoList', () => {
    it('renameTodoList scopes its update to both list id and database id', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: null, error: null })
      const { renameTodoList } = await import('@/lib/actions/todos')
      await expect(renameTodoList('list-1', 'db-1', 'ws-1', 'New Name')).resolves.toBeUndefined()
    })

    it('deleteTodoList propagates a database error', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: null, error: { message: 'delete failed' } })
      const { deleteTodoList } = await import('@/lib/actions/todos')
      await expect(deleteTodoList('list-1', 'db-1', 'ws-1')).rejects.toThrow('delete failed')
    })

    it('deleteTodoItem propagates a database error', async () => {
      queueAccessGranted()
      queueOnce('todo_items', { data: null, error: { message: 'delete failed' } })
      const { deleteTodoItem } = await import('@/lib/actions/todos')
      await expect(deleteTodoItem('item-1', 'db-1', 'ws-1')).rejects.toThrow('delete failed')
    })
  })
})
