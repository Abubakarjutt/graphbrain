import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SchemaEditor } from '@/components/database/SchemaEditor'
import type { DatabaseField } from '@/lib/types/database'

const schema: DatabaseField[] = [
  { id: 'f1', name: 'Status', type: 'select', options: ['To Do', 'Done'] },
  { id: 'f2', name: 'Notes', type: 'text' },
]

function renderEditor(overrides: Partial<React.ComponentProps<typeof SchemaEditor>> = {}) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <SchemaEditor schema={schema} onChange={onChange} onClose={onClose} {...overrides} />
  )
  return { onChange, onClose, ...utils }
}

function addField(name: string, type?: string) {
  fireEvent.change(screen.getByLabelText('New field name'), { target: { value: name } })
  if (type) {
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: type } })
  }
  fireEvent.click(screen.getByText('Add'))
}

describe('SchemaEditor', () => {
  it('lists each existing field with its name and type', () => {
    renderEditor()
    const statusRow = screen.getByText('Status').closest('div') as HTMLElement
    expect(within(statusRow).getByText('select')).toBeInTheDocument()

    const notesRow = screen.getByText('Notes').closest('div') as HTMLElement
    expect(within(notesRow).getByText('text')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no fields', () => {
    renderEditor({ schema: [] })
    expect(screen.getByText('No fields yet. Add one below.')).toBeInTheDocument()
  })

  it('hides the empty-state message when fields exist', () => {
    renderEditor()
    expect(screen.queryByText('No fields yet. Add one below.')).not.toBeInTheDocument()
  })

  it('calls onClose when the Close button is clicked', () => {
    const { onClose } = renderEditor()
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('removes only the targeted field, keeping the rest', () => {
    const { onChange } = renderEditor()
    fireEvent.click(screen.getByLabelText('Remove Status'))
    expect(onChange).toHaveBeenCalledWith([schema[1]])
  })

  it('offers all seven field types in the type selector', () => {
    renderEditor()
    const select = screen.getByLabelText('Field type') as HTMLSelectElement
    const values = Array.from(select.options).map(o => o.value)
    expect(values).toEqual(['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url'])
  })

  it('adds a new field with the typed name and default text type', () => {
    const { onChange } = renderEditor()
    addField('Priority')

    expect(onChange).toHaveBeenCalledTimes(1)
    const newSchema = onChange.mock.calls[0][0] as DatabaseField[]
    expect(newSchema).toHaveLength(3)
    const added = newSchema[2]
    expect(added).toMatchObject({ name: 'Priority', type: 'text', options: undefined })
    expect(typeof added.id).toBe('string')
    expect(added.id.length).toBeGreaterThan(0)
  })

  it('gives a select field an empty options array', () => {
    const { onChange } = renderEditor()
    addField('Category', 'select')
    expect(onChange.mock.calls[0][0][2]).toMatchObject({ type: 'select', options: [] })
  })

  it('gives a multi_select field an empty options array', () => {
    const { onChange } = renderEditor()
    addField('Tags', 'multi_select')
    expect(onChange.mock.calls[0][0][2]).toMatchObject({ type: 'multi_select', options: [] })
  })

  it('leaves options undefined for non-select field types', () => {
    const { onChange } = renderEditor()
    addField('Score', 'number')
    expect(onChange.mock.calls[0][0][2]).toMatchObject({ type: 'number', options: undefined })
  })

  it('trims leading and trailing whitespace from the field name', () => {
    const { onChange } = renderEditor()
    addField('  Padded Name  ')
    expect(onChange.mock.calls[0][0][2]).toMatchObject({ name: 'Padded Name' })
  })

  it('does not add a field when the name is blank', () => {
    const { onChange } = renderEditor()
    addField('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not add a field when the name is only whitespace', () => {
    const { onChange } = renderEditor()
    addField('   ')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clears the name input and resets the type after adding a field', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'number' } })
    addField('Score')

    expect(screen.getByLabelText('New field name')).toHaveValue('')
    expect(screen.getByLabelText('Field type')).toHaveValue('text')
  })

  it('adds a field when Enter is pressed in the name input', () => {
    const { onChange } = renderEditor()
    const input = screen.getByLabelText('New field name')
    fireEvent.change(input, { target: { value: 'Via Enter' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][2]).toMatchObject({ name: 'Via Enter' })
  })

  it('does not add a field on other key presses', () => {
    const { onChange } = renderEditor()
    const input = screen.getByLabelText('New field name')
    fireEvent.change(input, { target: { value: 'Not yet' } })
    fireEvent.keyDown(input, { key: 'a' })

    expect(onChange).not.toHaveBeenCalled()
  })
})
