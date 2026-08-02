import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PropertiesPanel } from '@/components/database/PropertiesPanel'
import { updateRowFields } from '@/lib/actions/databases'
import type { DatabaseField } from '@/lib/types/database'

vi.mock('@/lib/actions/databases', () => ({
  updateRowFields: vi.fn().mockResolvedValue(undefined),
}))

const schema: DatabaseField[] = [
  { id: 'f-text', name: 'Notes', type: 'text' },
  { id: 'f-number', name: 'Score', type: 'number' },
  { id: 'f-date', name: 'Due', type: 'date' },
  { id: 'f-checkbox', name: 'Done', type: 'checkbox' },
]

const initialFields = {
  'f-text': 'hello',
  'f-number': 5,
  'f-date': '2026-01-01',
  'f-checkbox': true,
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof PropertiesPanel>> = {}) {
  return render(
    <PropertiesPanel
      rowId="row-1"
      databaseId="db-1"
      workspaceId="ws-1"
      schema={schema}
      initialFields={initialFields}
      {...overrides}
    />
  )
}

describe('PropertiesPanel', () => {
  beforeEach(() => {
    vi.mocked(updateRowFields).mockReset().mockResolvedValue(undefined)
  })

  it('renders the Properties heading', () => {
    renderPanel()
    expect(screen.getByText('Properties')).toBeInTheDocument()
  })

  it('shows an empty-state message when the schema has no fields', () => {
    renderPanel({ schema: [] })
    expect(screen.getByText('No properties yet. Add fields in the database.')).toBeInTheDocument()
  })

  it('pre-fills each field from initialFields', () => {
    renderPanel()
    expect(screen.getByLabelText('Notes')).toHaveValue('hello')
    expect(screen.getByLabelText('Score')).toHaveValue(5)
    expect(screen.getByLabelText('Due')).toHaveValue('2026-01-01')
    expect(screen.getByLabelText('Done')).toBeChecked()
  })

  it('shows an empty value for a field missing from initialFields', () => {
    renderPanel({ initialFields: {} })
    expect(screen.getByLabelText('Notes')).toHaveValue('')
    expect(screen.getByLabelText('Done')).not.toBeChecked()
  })

  it('saves a text field on blur, not on every keystroke', async () => {
    renderPanel()
    const input = screen.getByLabelText('Notes')

    fireEvent.change(input, { target: { value: 'typing...' } })
    expect(updateRowFields).not.toHaveBeenCalled()

    fireEvent.blur(input)
    await waitFor(() => {
      expect(updateRowFields).toHaveBeenCalledWith(
        'row-1', 'db-1', 'ws-1',
        expect.objectContaining({ 'f-text': 'typing...' })
      )
    })
  })

  it('converts a number field to a Number on blur, or null when cleared', async () => {
    renderPanel()
    const input = screen.getByLabelText('Score')

    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(updateRowFields).toHaveBeenLastCalledWith(
        'row-1', 'db-1', 'ws-1',
        expect.objectContaining({ 'f-number': 42 })
      )
    })

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(updateRowFields).toHaveBeenLastCalledWith(
        'row-1', 'db-1', 'ws-1',
        expect.objectContaining({ 'f-number': null })
      )
    })
  })

  it('converts an empty date field to null on blur', async () => {
    renderPanel()
    const input = screen.getByLabelText('Due')

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(updateRowFields).toHaveBeenCalledWith(
        'row-1', 'db-1', 'ws-1',
        expect.objectContaining({ 'f-date': null })
      )
    })
  })

  it('saves a checkbox field immediately on change, without needing blur', async () => {
    renderPanel()
    fireEvent.click(screen.getByLabelText('Done'))

    await waitFor(() => {
      expect(updateRowFields).toHaveBeenCalledWith(
        'row-1', 'db-1', 'ws-1',
        expect.objectContaining({ 'f-checkbox': false })
      )
    })
  })

  it('shows an error and reverts the displayed value when saving fails', async () => {
    vi.mocked(updateRowFields).mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    const input = screen.getByLabelText('Notes')

    fireEvent.change(input, { target: { value: 'will fail' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.getByText('Failed to save')).toBeInTheDocument()
    })
    expect(input).toHaveValue('hello')
  })

  it('clears a previous error once a later save succeeds', async () => {
    vi.mocked(updateRowFields).mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    const input = screen.getByLabelText('Notes')

    fireEvent.change(input, { target: { value: 'will fail' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(screen.getByText('Failed to save')).toBeInTheDocument()
    })

    fireEvent.change(input, { target: { value: 'will succeed' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(screen.queryByText('Failed to save')).not.toBeInTheDocument()
    })
  })

  it('accommodates a new field added to the schema without losing existing values', () => {
    const { rerender } = renderPanel()
    expect(screen.getByLabelText('Notes')).toHaveValue('hello')

    const expandedSchema = [...schema, { id: 'f-new', name: 'Priority', type: 'text' as const }]
    rerender(
      <PropertiesPanel
        rowId="row-1"
        databaseId="db-1"
        workspaceId="ws-1"
        schema={expandedSchema}
        initialFields={initialFields}
      />
    )

    expect(screen.getByLabelText('Priority')).toHaveValue('')
    expect(screen.getByLabelText('Notes')).toHaveValue('hello')
  })
})
