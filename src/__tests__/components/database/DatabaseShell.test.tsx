import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DatabaseShell } from '@/components/database/DatabaseShell'
import { updateDatabaseSchema, createRow, deleteRow } from '@/lib/actions/databases'
import type { DatabaseField, DatabaseRowWithTitle, Page, TodoBoard } from '@/lib/types/database'

// TableView/KanbanView/CalendarView/SchemaEditor each have their own test
// suites — stubbed here so this file stays focused on what DatabaseShell
// itself owns: view switching, schema-editor toggle, and the optimistic
// update/revert logic around schema/row changes.
vi.mock('@/components/database/SchemaEditor', () => ({
  SchemaEditor: ({ schema, onChange, onClose }: {
    schema: DatabaseField[]
    onChange: (s: DatabaseField[]) => void
    onClose: () => void
  }) => (
    <div data-testid="schema-editor-stub">
      <span>schema-fields:{schema.length}</span>
      <button onClick={() => onChange([...schema, { id: 'new-field', name: 'New Field', type: 'text' }])}>
        trigger-schema-change
      </button>
      <button onClick={onClose}>close-schema-editor</button>
    </div>
  ),
}))

vi.mock('@/components/database/TableView', () => ({
  TableView: ({ rows, schema, onAddRow, onRowUpdate, onDeleteRow }: {
    rows: DatabaseRowWithTitle[]
    schema: DatabaseField[]
    onAddRow: () => void
    onRowUpdate: (id: string, fields: Record<string, unknown>) => void
    onDeleteRow: (id: string) => void
  }) => (
    <div data-testid="table-view-stub">
      <span>table-fields:{schema.length}</span>
      <button onClick={onAddRow}>trigger-add-row</button>
      <ul>
        {rows.map(r => (
          <li key={r.id}>
            <span data-testid="row-label">{r.id}{r.fields.touched ? ':touched' : ''}</span>
            <button onClick={() => onRowUpdate(r.id, { touched: true })}>update:{r.id}</button>
            <button onClick={() => onDeleteRow(r.id)}>delete:{r.id}</button>
          </li>
        ))}
      </ul>
    </div>
  ),
}))

vi.mock('@/components/database/KanbanView', () => ({
  KanbanView: ({ board, onBoardChange }: { board: TodoBoard; onBoardChange: (b: TodoBoard) => void }) => (
    <div data-testid="kanban-view-stub">
      kanban-lists:{board.lists.length}
      <button
        onClick={() => onBoardChange({
          ...board,
          lists: [...board.lists, { id: 'new-list', database_id: 'db-1', name: 'New List', position: board.lists.length, created_at: '' }],
        })}
      >
        trigger-add-list
      </button>
    </div>
  ),
}))

vi.mock('@/components/database/CalendarView', () => ({
  CalendarView: ({ board }: { board: TodoBoard }) => (
    <div data-testid="calendar-view-stub">calendar-lists:{board.lists.length}</div>
  ),
}))

vi.mock('@/components/database/DocsView', () => ({
  DocsView: ({ docs }: { docs: Page[] }) => (
    <div data-testid="docs-view-stub">docs-count:{docs.length}</div>
  ),
}))

vi.mock('@/lib/actions/databases', () => ({
  updateDatabaseSchema: vi.fn().mockResolvedValue(undefined),
  createRow: vi.fn(),
  deleteRow: vi.fn().mockResolvedValue(undefined),
}))

const schema: DatabaseField[] = [{ id: 'f1', name: 'Status', type: 'text' }]

const rows: DatabaseRowWithTitle[] = [
  { id: 'row-1', database_id: 'db-1', page_id: 'p1', page_title: 'Row One', fields: {}, created_at: '' },
  { id: 'row-2', database_id: 'db-1', page_id: 'p2', page_title: 'Row Two', fields: {}, created_at: '' },
  { id: 'row-3', database_id: 'db-1', page_id: 'p3', page_title: 'Row Three', fields: {}, created_at: '' },
]

const todoBoard: TodoBoard = { lists: [], items: [] }
const pages: Page[] = []

const docs: Page[] = [
  { id: 'doc-1', workspace_id: 'ws-1', parent_id: null, database_id: 'db-1', title: 'Doc One', created_by: 'u1', created_at: '', updated_at: '' },
]

function renderShell(overrides: Partial<React.ComponentProps<typeof DatabaseShell>> = {}) {
  return render(
    <DatabaseShell
      databaseId="db-1"
      workspaceId="ws-1"
      title="My Database"
      schema={schema}
      rows={rows}
      todoBoard={todoBoard}
      pages={pages}
      docs={docs}
      {...overrides}
    />
  )
}

function rowIds() {
  return screen.getAllByTestId('row-label').map(el => el.textContent)
}

describe('DatabaseShell', () => {
  beforeEach(() => {
    vi.mocked(updateDatabaseSchema).mockReset().mockResolvedValue(undefined)
    vi.mocked(createRow).mockReset()
    vi.mocked(deleteRow).mockReset().mockResolvedValue(undefined)
  })

  it('renders the title in both the breadcrumb and the heading', () => {
    renderShell()
    expect(screen.getAllByText('My Database').length).toBeGreaterThanOrEqual(2)
  })

  it('defaults to the Table view', () => {
    renderShell()
    expect(screen.getByTestId('table-view-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('kanban-view-stub')).not.toBeInTheDocument()
    expect(screen.queryByTestId('calendar-view-stub')).not.toBeInTheDocument()
  })

  it('switches to the Kanban view when its tab is clicked', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    expect(screen.getByTestId('kanban-view-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('table-view-stub')).not.toBeInTheDocument()
  })

  it('switches to the Calendar view when its tab is clicked', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }))
    expect(screen.getByTestId('calendar-view-stub')).toBeInTheDocument()
  })

  it('switches to the Docs view when its tab is clicked', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Docs/ }))
    expect(screen.getByTestId('docs-view-stub')).toBeInTheDocument()
    expect(screen.getByTestId('docs-view-stub')).toHaveTextContent('docs-count:1')
    expect(screen.queryByTestId('table-view-stub')).not.toBeInTheDocument()
  })

  it('marks the active view tab with aria-pressed', () => {
    renderShell()
    expect(screen.getByRole('button', { name: /Table/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Kanban/ })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    expect(screen.getByRole('button', { name: /Kanban/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Table/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the to-do board state shared between Kanban and Calendar, independent of the table', () => {
    renderShell()
    expect(screen.getByTestId('table-view-stub')).toHaveTextContent('table-fields:1')

    fireEvent.click(screen.getByRole('button', { name: /Kanban/ }))
    expect(screen.getByTestId('kanban-view-stub')).toHaveTextContent('kanban-lists:0')
    fireEvent.click(screen.getByText('trigger-add-list'))
    expect(screen.getByTestId('kanban-view-stub')).toHaveTextContent('kanban-lists:1')

    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }))
    expect(screen.getByTestId('calendar-view-stub')).toHaveTextContent('calendar-lists:1')

    fireEvent.click(screen.getByRole('button', { name: /Table/ }))
    expect(rowIds()).toEqual(['row-1', 'row-2', 'row-3'])
  })

  it('the Properties button toggles the schema editor, hidden by default', () => {
    renderShell()
    expect(screen.queryByTestId('schema-editor-stub')).not.toBeInTheDocument()

    const propsButton = screen.getByRole('button', { name: /Properties/ })
    expect(propsButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(propsButton)
    expect(screen.getByTestId('schema-editor-stub')).toBeInTheDocument()
    expect(propsButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByText('close-schema-editor'))
    expect(screen.queryByTestId('schema-editor-stub')).not.toBeInTheDocument()
  })

  it('applies a schema change optimistically and persists it', async () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Properties/ }))
    fireEvent.click(screen.getByText('trigger-schema-change'))

    expect(screen.getByTestId('table-view-stub')).toHaveTextContent('table-fields:2')
    await waitFor(() => {
      expect(updateDatabaseSchema).toHaveBeenCalledWith(
        'db-1', 'ws-1',
        expect.arrayContaining([expect.objectContaining({ id: 'new-field' })])
      )
    })
  })

  it('reverts a schema change and shows an error when saving it fails', async () => {
    vi.mocked(updateDatabaseSchema).mockRejectedValueOnce(new Error('boom'))
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Properties/ }))
    fireEvent.click(screen.getByText('trigger-schema-change'))

    expect(screen.getByTestId('table-view-stub')).toHaveTextContent('table-fields:2')
    await waitFor(() => {
      expect(screen.getByText('Failed to update schema')).toBeInTheDocument()
    })
    expect(screen.getByTestId('table-view-stub')).toHaveTextContent('table-fields:1')
  })

  it('adds a row returned by the server on success', async () => {
    const newRow: DatabaseRowWithTitle = { id: 'row-4', database_id: 'db-1', page_id: 'p4', page_title: 'Row Four', fields: {}, created_at: '' }
    vi.mocked(createRow).mockResolvedValueOnce(newRow)
    renderShell()

    fireEvent.click(screen.getByText('trigger-add-row'))

    await waitFor(() => {
      expect(rowIds()).toEqual(['row-1', 'row-2', 'row-3', 'row-4'])
    })
    expect(createRow).toHaveBeenCalledWith('db-1', 'ws-1')
  })

  it('shows an error and adds nothing when creating a row fails', async () => {
    vi.mocked(createRow).mockRejectedValueOnce(new Error('boom'))
    renderShell()

    fireEvent.click(screen.getByText('trigger-add-row'))

    await waitFor(() => {
      expect(screen.getByText('Failed to create row')).toBeInTheDocument()
    })
    expect(rowIds()).toEqual(['row-1', 'row-2', 'row-3'])
  })

  it('updates a row in place without removing or reordering others', () => {
    renderShell()
    fireEvent.click(screen.getByText('update:row-2'))

    expect(rowIds()).toEqual(['row-1', 'row-2:touched', 'row-3'])
  })

  it('removes a row optimistically and persists the deletion', async () => {
    renderShell()
    fireEvent.click(screen.getByText('delete:row-2'))

    expect(rowIds()).toEqual(['row-1', 'row-3'])
    await waitFor(() => {
      expect(deleteRow).toHaveBeenCalledWith('row-2', 'db-1', 'ws-1')
    })
  })

  it('re-inserts a deleted row at its original position when deletion fails', async () => {
    vi.mocked(deleteRow).mockRejectedValueOnce(new Error('boom'))
    renderShell()

    fireEvent.click(screen.getByText('delete:row-2'))
    expect(rowIds()).toEqual(['row-1', 'row-3'])

    await waitFor(() => {
      expect(screen.getByText('Failed to delete row')).toBeInTheDocument()
    })
    expect(rowIds()).toEqual(['row-1', 'row-2', 'row-3'])
  })
})
