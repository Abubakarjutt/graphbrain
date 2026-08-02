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
]

const rows: DatabaseRowWithTitle[] = [
  {
    id: 'row-1',
    database_id: 'db-1',
    page_id: 'page-1',
    page_title: 'Row One',
    fields: { 'f-text': 'hello', 'f-number': 5, 'f-date': '2026-01-01', 'f-checkbox': true },
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
})
