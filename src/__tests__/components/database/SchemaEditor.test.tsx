import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
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

  it('clears the name input and resets the type after adding a field', async () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'number' } })
    addField('Score')

    await waitFor(() => expect(screen.getByLabelText('New field name')).toHaveValue(''))
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

  it('shows the current options for an existing select field', () => {
    renderEditor()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('does not show an options editor for a non-option field type', () => {
    renderEditor()
    expect(screen.queryByLabelText('New option for Notes')).not.toBeInTheDocument()
  })

  it('adds a new option to an existing select field', () => {
    const { onChange } = renderEditor()
    const input = screen.getByLabelText('New option for Status')
    fireEvent.change(input, { target: { value: 'In Progress' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith([
      { ...schema[0], options: ['To Do', 'Done', 'In Progress'] },
      schema[1],
    ])
  })

  it('clears the option draft input after adding an option', async () => {
    renderEditor()
    const input = screen.getByLabelText('New option for Status')
    fireEvent.change(input, { target: { value: 'In Progress' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('does not add a duplicate option to an existing field', () => {
    const { onChange } = renderEditor()
    const input = screen.getByLabelText('New option for Status')
    fireEvent.change(input, { target: { value: 'To Do' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not add a blank option', () => {
    const { onChange } = renderEditor()
    const input = screen.getByLabelText('New option for Status')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes an option from an existing select field', () => {
    const { onChange } = renderEditor()
    fireEvent.click(screen.getByLabelText('Remove option To Do from Status'))

    expect(onChange).toHaveBeenCalledWith([
      { ...schema[0], options: ['Done'] },
      schema[1],
    ])
  })

  it('lets options be added while creating a new select field, included when it is added', () => {
    const { onChange } = renderEditor()
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'select' } })

    const optionInput = screen.getByLabelText('New field option')
    fireEvent.change(optionInput, { target: { value: 'Low' } })
    fireEvent.keyDown(optionInput, { key: 'Enter' })
    fireEvent.change(optionInput, { target: { value: 'High' } })
    fireEvent.keyDown(optionInput, { key: 'Enter' })

    expect(screen.getByText('Low')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()

    addField('Priority')

    expect(onChange.mock.calls[0][0][2]).toMatchObject({
      name: 'Priority', type: 'select', options: ['Low', 'High'],
    })
  })

  it('removes a pending option before the field is created', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'select' } })

    const optionInput = screen.getByLabelText('New field option')
    fireEvent.change(optionInput, { target: { value: 'Low' } })
    fireEvent.keyDown(optionInput, { key: 'Enter' })
    expect(screen.getByText('Low')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Remove option Low'))
    expect(screen.queryByText('Low')).not.toBeInTheDocument()
  })

  it('resets pending options after the field is created', async () => {
    const { onChange } = renderEditor()
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'select' } })
    const optionInput = screen.getByLabelText('New field option')
    fireEvent.change(optionInput, { target: { value: 'Low' } })
    fireEvent.keyDown(optionInput, { key: 'Enter' })

    addField('Priority')

    expect(onChange.mock.calls[0][0][2]).toMatchObject({ options: ['Low'] })
    await waitFor(() => expect(screen.queryByText('Low')).not.toBeInTheDocument())
  })

  it('does not add a duplicate option to an existing field, case-insensitively', () => {
    const { onChange } = renderEditor()
    const input = screen.getByLabelText('New option for Status')
    fireEvent.change(input, { target: { value: 'to do' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('flushes an uncommitted pending option when the new field is submitted without pressing Enter on it', async () => {
    const { onChange } = renderEditor()
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'select' } })

    // Type a pending option but never press Enter or click anything to commit it —
    // only the field-name Enter/Add should be responsible for flushing it.
    fireEvent.change(screen.getByLabelText('New field option'), { target: { value: 'Low' } })

    addField('Priority')

    await waitFor(() => {
      expect(onChange.mock.calls[0][0][2]).toMatchObject({ name: 'Priority', options: ['Low'] })
    })
  })

  it('does not duplicate a pending option that was both committed and left in the draft box', async () => {
    const { onChange } = renderEditor()
    fireEvent.change(screen.getByLabelText('Field type'), { target: { value: 'select' } })

    const optionInput = screen.getByLabelText('New field option')
    fireEvent.change(optionInput, { target: { value: 'Low' } })
    fireEvent.keyDown(optionInput, { key: 'Enter' })
    // Re-type the same text without re-committing it.
    fireEvent.change(optionInput, { target: { value: 'Low' } })

    addField('Priority')

    await waitFor(() => {
      expect(onChange.mock.calls[0][0][2]).toMatchObject({ options: ['Low'] })
    })
  })

  it('keeps the name input filled when the persist fails, so the user can retry', async () => {
    const onChange = vi.fn().mockResolvedValue(false)
    render(<SchemaEditor schema={schema} onChange={onChange} onClose={vi.fn()} />)
    addField('Priority')

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('New field name')).toHaveValue('Priority')
  })

  it('ignores a second submit fired while the first is still in flight, so it does not create a duplicate field', async () => {
    let resolveOnChange: (value: boolean) => void
    const onChange = vi.fn().mockReturnValueOnce(new Promise<boolean>(resolve => { resolveOnChange = resolve }))
    render(<SchemaEditor schema={schema} onChange={onChange} onClose={vi.fn()} />)

    const input = screen.getByLabelText('New field name')
    fireEvent.change(input, { target: { value: 'Priority' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByText('Add'))

    expect(onChange).toHaveBeenCalledTimes(1)

    resolveOnChange!(true)
    await waitFor(() => expect(screen.getByLabelText('New field name')).toHaveValue(''))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('disables the Add button and name input while a submit is in flight', async () => {
    let resolveOnChange: (value: boolean) => void
    const onChange = vi.fn().mockReturnValueOnce(new Promise<boolean>(resolve => { resolveOnChange = resolve }))
    render(<SchemaEditor schema={schema} onChange={onChange} onClose={vi.fn()} />)
    addField('Priority')

    await waitFor(() => expect(screen.getByText('Add')).toBeDisabled())
    expect(screen.getByLabelText('New field name')).toBeDisabled()

    resolveOnChange!(true)
    await waitFor(() => expect(screen.getByText('Add')).not.toBeDisabled())
  })

  it('keeps the option draft filled when adding an option to an existing field fails', async () => {
    const onChange = vi.fn().mockResolvedValue(false)
    render(<SchemaEditor schema={schema} onChange={onChange} onClose={vi.fn()} />)
    const input = screen.getByLabelText('New option for Status')
    fireEvent.change(input, { target: { value: 'In Progress' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(input).toHaveValue('In Progress')
  })
})
