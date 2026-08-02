import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TableView } from '@/components/database/TableView'
import { updateRowFields } from '@/lib/actions/databases'
import type { DatabaseField, DatabaseRowWithTitle } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('@/lib/actions/databases', () => ({
  updateRowFields: vi.fn().mockResolvedValue(undefined),
}))

const schema: DatabaseField[] = [
  { id: 'f-text', name: 'Notes', type: 'text' },
  { id: 'f-number', name: 'Score', type: 'number' },
  { id: 'f-date', name: 'Due', type: 'date' },
  { id: 'f-checkbox', name: 'Done', type: 'checkbox' },
  { id: 'f-select', name: 'Status', type: 'select', options: ['To Do', 'Complete'] },
  { id: 'f-multi', name: 'Tags', type: 'multi_select', options: ['Urgent', 'Bug'] },
]

const rows: DatabaseRowWithTitle[] = [
  {
    id: 'row-1',
    database_id: 'db-1',
    page_id: 'page-1',
    page_title: 'Row One',
    fields: { 'f-text': 'hello', 'f-number': 5, 'f-date': '2026-01-01', 'f-checkbox': true, 'f-select': 'To Do', 'f-multi': ['Bug'] },
    created_at: '',
  },
  {
    id: 'row-2',
    database_id: 'db-1',
    page_id: null,
    page_title: 'Row Two',
    fields: {},
    created_at: '',
  },
]

function renderTable(overrides: Partial<React.ComponentProps<typeof TableView>> = {}) {
  const onAddRow = vi.fn()
  const onRowUpdate = vi.fn()
  const onDeleteRow = vi.fn()
  const utils = render(
    <TableView
      databaseId="db-1"
      workspaceId="ws-1"
      schema={schema}
      rows={rows}
      onAddRow={onAddRow}
      onRowUpdate={onRowUpdate}
      onDeleteRow={onDeleteRow}
      {...overrides}
    />
  )
  return { onAddRow, onRowUpdate, onDeleteRow, ...utils }
}

function rowFor(title: string): HTMLElement {
  return screen.getByText(title).closest('tr') as HTMLElement
}

describe('TableView', () => {
  beforeEach(() => {
    vi.mocked(updateRowFields).mockReset().mockResolvedValue(undefined)
  })

  it('renders a column header for each schema field plus Name', () => {
    renderTable()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Due')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('links to the page for a row that has one', () => {
    renderTable()
    const link = screen.getByText('Row One').closest('a')
    expect(link).toHaveAttribute('href', '/workspace/ws-1/page/page-1')
  })

  it('renders a plain label (no link) for a row with no page_id', () => {
    renderTable()
    expect(screen.getByText('Row Two').closest('a')).toBeNull()
  })

  it('pre-fills each cell with the row\'s existing field value', () => {
    renderTable()
    const tr = rowFor('Row One')
    expect(within(tr).getByLabelText('Notes')).toHaveValue('hello')
    expect(within(tr).getByLabelText('Score')).toHaveValue(5)
    expect(within(tr).getByLabelText('Due')).toHaveValue('2026-01-01')
    expect(within(tr).getByLabelText('Done')).toBeChecked()
  })

  it('shows an empty cell for a row with no value for a field', () => {
    renderTable()
    const tr = rowFor('Row Two')
    expect(within(tr).getByLabelText('Notes')).toHaveValue('')
    expect(within(tr).getByLabelText('Done')).not.toBeChecked()
  })

  it('saves a text field on blur, optimistically and via the server action', async () => {
    const { onRowUpdate } = renderTable()
    const input = within(rowFor('Row One')).getByLabelText('Notes')

    fireEvent.change(input, { target: { value: 'updated notes' } })
    fireEvent.blur(input)

    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ 'f-text': 'updated notes' }))
    await waitFor(() => {
      expect(updateRowFields).toHaveBeenCalledWith(
        'row-1', 'db-1', 'ws-1',
        expect.objectContaining({ 'f-text': 'updated notes' })
      )
    })
  })

  it('converts a number field to a Number on blur, or null when cleared', () => {
    const { onRowUpdate } = renderTable()
    const input = within(rowFor('Row One')).getByLabelText('Score')

    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.blur(input)
    expect(onRowUpdate).toHaveBeenLastCalledWith('row-1', expect.objectContaining({ 'f-number': 42 }))

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onRowUpdate).toHaveBeenLastCalledWith('row-1', expect.objectContaining({ 'f-number': null }))
  })

  it('converts an empty date field to null on blur', () => {
    const { onRowUpdate } = renderTable()
    const input = within(rowFor('Row One')).getByLabelText('Due')

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onRowUpdate).toHaveBeenLastCalledWith('row-1', expect.objectContaining({ 'f-date': null }))
  })

  it('saves a checkbox field immediately on change, without needing blur', () => {
    const { onRowUpdate } = renderTable()
    const checkbox = within(rowFor('Row Two')).getByLabelText('Done')

    fireEvent.click(checkbox)
    expect(onRowUpdate).toHaveBeenCalledWith('row-2', expect.objectContaining({ 'f-checkbox': true }))
  })

  it('reverts the optimistic update when the server action fails', async () => {
    vi.mocked(updateRowFields).mockRejectedValueOnce(new Error('boom'))
    const { onRowUpdate } = renderTable()
    const input = within(rowFor('Row One')).getByLabelText('Notes')

    fireEvent.change(input, { target: { value: 'will fail' } })
    fireEvent.blur(input)

    expect(onRowUpdate).toHaveBeenNthCalledWith(1, 'row-1', expect.objectContaining({ 'f-text': 'will fail' }))
    await waitFor(() => {
      expect(onRowUpdate).toHaveBeenNthCalledWith(2, 'row-1', rows[0].fields)
    })
  })

  it('resets a cell\'s local value when its underlying value prop changes', () => {
    const { rerender } = renderTable()
    const tr = rowFor('Row One')
    expect(within(tr).getByLabelText('Notes')).toHaveValue('hello')

    const updatedRows = [
      { ...rows[0], fields: { ...rows[0].fields, 'f-text': 'changed elsewhere' } },
      rows[1],
    ]
    rerender(
      <TableView
        databaseId="db-1"
        workspaceId="ws-1"
        schema={schema}
        rows={updatedRows}
        onAddRow={vi.fn()}
        onRowUpdate={vi.fn()}
        onDeleteRow={vi.fn()}
      />
    )

    expect(within(rowFor('Row One')).getByLabelText('Notes')).toHaveValue('changed elsewhere')
  })

  it('calls onAddRow when the New button is clicked', () => {
    const { onAddRow } = renderTable()
    fireEvent.click(screen.getByText('New'))
    expect(onAddRow).toHaveBeenCalledTimes(1)
  })

  it('calls onDeleteRow with the correct row id', () => {
    const { onDeleteRow } = renderTable()
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete row' })
    fireEvent.click(deleteButtons[1])
    expect(onDeleteRow).toHaveBeenCalledWith('row-2')
  })

  it('renders a select field as a dropdown pre-filled with the current value, offering every option', () => {
    renderTable()
    const select = within(rowFor('Row One')).getByLabelText('Status') as HTMLSelectElement
    expect(select).toHaveValue('To Do')
    expect(Array.from(select.options).map(o => o.value)).toEqual(['', 'To Do', 'Complete'])
  })

  it('saves a select field immediately on change, without needing blur', () => {
    const { onRowUpdate } = renderTable()
    const select = within(rowFor('Row One')).getByLabelText('Status')

    fireEvent.change(select, { target: { value: 'Complete' } })

    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ 'f-select': 'Complete' }))
  })

  it('sets a select field to null when cleared back to the blank option', () => {
    const { onRowUpdate } = renderTable()
    const select = within(rowFor('Row One')).getByLabelText('Status')

    fireEvent.change(select, { target: { value: '' } })

    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ 'f-select': null }))
  })

  it('renders multi_select options as toggles reflecting the current selection', () => {
    renderTable()
    const tr = rowFor('Row One')
    expect(within(tr).getByText('Bug')).toHaveAttribute('aria-pressed', 'true')
    expect(within(tr).getByText('Urgent')).toHaveAttribute('aria-pressed', 'false')
  })

  it('adds an option to a multi_select field when an unselected toggle is clicked', () => {
    const { onRowUpdate } = renderTable()
    fireEvent.click(within(rowFor('Row One')).getByText('Urgent'))

    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ 'f-multi': ['Bug', 'Urgent'] }))
  })

  it('removes an option from a multi_select field when a selected toggle is clicked', () => {
    const { onRowUpdate } = renderTable()
    fireEvent.click(within(rowFor('Row One')).getByText('Bug'))

    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ 'f-multi': [] }))
  })

  it('groups multi_select toggles under an accessible group labeled with the field name', () => {
    renderTable()
    expect(within(rowFor('Row One')).getByRole('group', { name: 'Tags' })).toBeInTheDocument()
  })

  it('shows a select value whose option was removed from the field as a distinct, visible entry', () => {
    const orphanedSchema: DatabaseField[] = [
      { id: 'f-select', name: 'Status', type: 'select', options: ['To Do', 'Complete'] },
    ]
    const orphanedRows: DatabaseRowWithTitle[] = [
      { id: 'row-1', database_id: 'db-1', page_id: null, page_title: 'Row One', fields: { 'f-select': 'Archived' }, created_at: '' },
    ]
    render(
      <TableView
        databaseId="db-1"
        workspaceId="ws-1"
        schema={orphanedSchema}
        rows={orphanedRows}
        onAddRow={vi.fn()}
        onRowUpdate={vi.fn()}
        onDeleteRow={vi.fn()}
      />
    )
    const select = screen.getByLabelText('Status') as HTMLSelectElement
    expect(select).toHaveValue('Archived')
    expect(within(select).getByText('Archived (removed)')).toBeInTheDocument()
  })

  it('shows a multi_select value whose option was removed from the field as a distinct, still-toggleable chip', () => {
    const orphanedSchema: DatabaseField[] = [
      { id: 'f-multi', name: 'Tags', type: 'multi_select', options: ['Urgent'] },
    ]
    const orphanedRows: DatabaseRowWithTitle[] = [
      { id: 'row-1', database_id: 'db-1', page_id: null, page_title: 'Row One', fields: { 'f-multi': ['Legacy'] }, created_at: '' },
    ]
    const onRowUpdate = vi.fn()
    render(
      <TableView
        databaseId="db-1"
        workspaceId="ws-1"
        schema={orphanedSchema}
        rows={orphanedRows}
        onAddRow={vi.fn()}
        onRowUpdate={onRowUpdate}
        onDeleteRow={vi.fn()}
      />
    )
    const chip = screen.getByText('Legacy')
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(chip)
    expect(onRowUpdate).toHaveBeenCalledWith('row-1', expect.objectContaining({ 'f-multi': [] }))
  })

  it('disables only the cell being written while its write is pending, re-enabling once it settles', async () => {
    let resolveUpdate: () => void
    vi.mocked(updateRowFields).mockReturnValueOnce(new Promise(resolve => { resolveUpdate = () => resolve(undefined) }))
    renderTable()
    const tr = rowFor('Row One')
    const select = within(tr).getByLabelText('Status')

    fireEvent.change(select, { target: { value: 'Complete' } })

    await waitFor(() => expect(select).toBeDisabled())

    resolveUpdate!()
    await waitFor(() => expect(select).not.toBeDisabled())
  })

  it('does not disable an unrelated cell in the same row, or any cell in another row, while a write is pending', async () => {
    let resolveUpdate: () => void
    vi.mocked(updateRowFields).mockReturnValueOnce(new Promise(resolve => { resolveUpdate = () => resolve(undefined) }))
    renderTable()
    const rowOne = rowFor('Row One')
    const select = within(rowOne).getByLabelText('Status')
    const tagToggleSameRow = within(rowOne).getByText('Urgent')
    const noteInOtherRow = within(rowFor('Row Two')).getByLabelText('Notes')

    fireEvent.change(select, { target: { value: 'Complete' } })

    await waitFor(() => expect(select).toBeDisabled())
    expect(tagToggleSameRow).not.toBeDisabled()
    expect(noteInOtherRow).not.toBeDisabled()

    resolveUpdate!()
  })

  it('treats a non-array multi_select value defensively, rendering as if nothing were selected', () => {
    const badValueSchema: DatabaseField[] = [
      { id: 'f-multi', name: 'Tags', type: 'multi_select', options: ['Urgent', 'Bug'] },
    ]
    render(
      <TableView
        databaseId="db-1"
        workspaceId="ws-1"
        schema={badValueSchema}
        rows={[{ id: 'row-x', database_id: 'db-1', page_id: null, page_title: 'Row X', fields: { 'f-multi': 'not-an-array' }, created_at: '' }]}
        onAddRow={vi.fn()}
        onRowUpdate={vi.fn()}
        onDeleteRow={vi.fn()}
      />
    )
    expect(screen.getByText('Urgent')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Bug')).toHaveAttribute('aria-pressed', 'false')
  })

  it('accumulates multiple multi_select toggles across a sequence of clicks', async () => {
    // TableView derives the selection purely from the `rows` prop (no internal
    // state), so each step here re-renders with the fields onRowUpdate would
    // have produced in the real optimistic-update flow driven by DatabaseShell,
    // waiting for each write's transition to settle before the next click.
    const onRowUpdate = vi.fn()
    const { rerender } = render(
      <TableView
        databaseId="db-1" workspaceId="ws-1" schema={schema} rows={rows}
        onAddRow={vi.fn()} onRowUpdate={onRowUpdate} onDeleteRow={vi.fn()}
      />
    )

    fireEvent.click(within(rowFor('Row One')).getByText('Urgent'))
    expect(onRowUpdate).toHaveBeenLastCalledWith('row-1', expect.objectContaining({ 'f-multi': ['Bug', 'Urgent'] }))
    await waitFor(() => expect(updateRowFields).toHaveBeenCalledTimes(1))

    const afterFirstToggle = [
      { ...rows[0], fields: { ...rows[0].fields, 'f-multi': ['Bug', 'Urgent'] } },
      rows[1],
    ]
    rerender(
      <TableView
        databaseId="db-1" workspaceId="ws-1" schema={schema} rows={afterFirstToggle}
        onAddRow={vi.fn()} onRowUpdate={onRowUpdate} onDeleteRow={vi.fn()}
      />
    )

    fireEvent.click(within(rowFor('Row One')).getByText('Bug'))
    expect(onRowUpdate).toHaveBeenLastCalledWith('row-1', expect.objectContaining({ 'f-multi': ['Urgent'] }))
    await waitFor(() => expect(updateRowFields).toHaveBeenCalledTimes(2))
  })

  it('shows a placeholder for a multi_select field with no options defined yet', () => {
    const noOptionsSchema: DatabaseField[] = [{ id: 'f-empty-multi', name: 'Labels', type: 'multi_select', options: [] }]
    render(
      <TableView
        databaseId="db-1"
        workspaceId="ws-1"
        schema={noOptionsSchema}
        rows={[{ id: 'row-x', database_id: 'db-1', page_id: null, page_title: 'Row X', fields: {}, created_at: '' }]}
        onAddRow={vi.fn()}
        onRowUpdate={vi.fn()}
        onDeleteRow={vi.fn()}
      />
    )
    expect(screen.getByText('No options yet')).toBeInTheDocument()
  })
})
