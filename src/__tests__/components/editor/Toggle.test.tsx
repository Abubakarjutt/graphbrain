import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Editor } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { slashItems } from '@/components/editor/extensions/slash-items'

// Import Toggle and ToggleView
import { Toggle } from '@/components/editor/extensions/Toggle'
import { ToggleView } from '@/components/editor/ToggleView'
import type { NodeViewProps } from '@tiptap/react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeadlessEditor(extensions: Extensions = []) {
  return new Editor({
    extensions: [StarterKit, ...extensions],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })
}

// ---------------------------------------------------------------------------
// Toggle node – JSON round-trip
// ---------------------------------------------------------------------------

describe('Toggle node', () => {
  it('registers as the "toggle" node type', () => {
    const editor = makeHeadlessEditor([Toggle])
    expect(editor.schema.nodes['toggle']).toBeDefined()
    editor.destroy()
  })

  it('round-trips default summary attr through JSON', () => {
    const editor = makeHeadlessEditor([Toggle])
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'toggle',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        },
      ],
    })
    const json = editor.getJSON()
    const toggleNode = json.content?.[0]
    expect(toggleNode?.type).toBe('toggle')
    expect(toggleNode?.attrs?.summary).toBe('')
    editor.destroy()
  })

  it('round-trips a custom summary attr through JSON', () => {
    const editor = makeHeadlessEditor([Toggle])
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'toggle',
          attrs: { summary: 'My Toggle Title' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Content' }] }],
        },
      ],
    })
    const json = editor.getJSON()
    const toggleNode = json.content?.[0]
    expect(toggleNode?.attrs?.summary).toBe('My Toggle Title')
    editor.destroy()
  })

  it('renderHTML includes data-toggle attribute', () => {
    const editor = makeHeadlessEditor([Toggle])
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'toggle',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Power' }] }],
        },
      ],
    })
    const html = editor.getHTML()
    expect(html).toContain('data-toggle')
    editor.destroy()
  })

  it('parseHTML restores toggle from data-toggle attribute', () => {
    const editor = makeHeadlessEditor([Toggle])
    editor.commands.setContent(
      '<div data-toggle="" data-summary="My Title"><p>Content</p></div>',
    )
    const json = editor.getJSON()
    const toggleNode = json.content?.[0]
    expect(toggleNode?.type).toBe('toggle')
    expect(toggleNode?.attrs?.summary).toBe('My Title')
    editor.destroy()
  })
})

// ---------------------------------------------------------------------------
// ToggleView – React render
// ---------------------------------------------------------------------------

describe('ToggleView component', () => {
  // Use a loose cast to avoid fighting with the full NodeViewProps signature,
  // which requires an `EditorView` that isn't available in jsdom unit tests.
  function makeMinimalProps(overrides: Record<string, unknown> = {}): NodeViewProps {
    const base = {
      node: {
        attrs: { summary: '' },
        type: { name: 'toggle' },
      },
      updateAttributes: () => {},
      deleteNode: () => {},
      getPos: () => 0,
      selected: false,
      editor: {},
      extension: {},
      decorations: [],
      innerDecorations: [],
      HTMLAttributes: {},
      ...overrides,
    }
    return base as unknown as NodeViewProps
  }

  it('renders a disclosure button with aria-expanded="true" by default', () => {
    render(<ToggleView {...makeMinimalProps()} />)
    const button = screen.getByRole('button', { name: /toggle section/i })
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders content region (data-testid="toggle-content") when open', () => {
    const { container } = render(<ToggleView {...makeMinimalProps()} />)
    expect(container.querySelector('[data-testid="toggle-content"]')).toBeInTheDocument()
  })

  it('collapses when the button is clicked (aria-expanded becomes false, content hidden)', async () => {
    render(<ToggleView {...makeMinimalProps()} />)
    const button = screen.getByRole('button', { name: /toggle section/i })
    expect(button).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'false')
    // Content stays mounted (so ProseMirror keeps its contentDOM) but is hidden.
    const content = screen.getByTestId('toggle-content')
    expect(content).toBeInTheDocument()
    expect(content).toHaveStyle({ display: 'none' })
  })

  it('re-expands when button is clicked again', async () => {
    render(<ToggleView {...makeMinimalProps()} />)
    const button = screen.getByRole('button', { name: /toggle section/i })

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const content = screen.getByTestId('toggle-content')
    expect(content).toBeInTheDocument()
    expect(content).not.toHaveStyle({ display: 'none' })
  })
})

// ---------------------------------------------------------------------------
// Slash-items registry – presence of Toggle entry
// ---------------------------------------------------------------------------

describe('slashItems toggle entry', () => {
  it('contains a Toggle item', () => {
    expect(slashItems.some((i) => i.title === 'Toggle')).toBe(true)
  })

  it('Toggle item has correct shape', () => {
    const item = slashItems.find((i) => i.title === 'Toggle')
    expect(item).toBeDefined()
    expect(item?.keywords).toContain('toggle')
    expect(typeof item?.command).toBe('function')
  })
})
