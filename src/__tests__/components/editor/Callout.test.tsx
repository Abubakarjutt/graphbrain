import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { slashItems } from '@/components/editor/extensions/slash-items'

// Import Callout and CalloutView
import { Callout } from '@/components/editor/extensions/Callout'
import { CalloutView } from '@/components/editor/CalloutView'
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
// Callout node – JSON round-trip
// ---------------------------------------------------------------------------

describe('Callout node', () => {
  it('registers as the "callout" node type', () => {
    const editor = makeHeadlessEditor([Callout])
    expect(editor.schema.nodes['callout']).toBeDefined()
    editor.destroy()
  })

  it('round-trips default emoji attr through JSON', () => {
    const editor = makeHeadlessEditor([Callout])
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'callout',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        },
      ],
    })
    const json = editor.getJSON()
    const calloutNode = json.content?.[0]
    expect(calloutNode?.type).toBe('callout')
    expect(calloutNode?.attrs?.emoji).toBe('💡')
    editor.destroy()
  })

  it('round-trips a custom emoji attr through JSON', () => {
    const editor = makeHeadlessEditor([Callout])
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { emoji: '🔥' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fire' }] }],
        },
      ],
    })
    const json = editor.getJSON()
    const calloutNode = json.content?.[0]
    expect(calloutNode?.attrs?.emoji).toBe('🔥')
    editor.destroy()
  })

  it('renderHTML includes data-emoji attribute', () => {
    const editor = makeHeadlessEditor([Callout])
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { emoji: '⚡' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Power' }] }],
        },
      ],
    })
    const html = editor.getHTML()
    expect(html).toContain('data-emoji="⚡"')
    expect(html).toContain('data-callout')
    editor.destroy()
  })

  it('parseHTML restores emoji from data-emoji attribute', () => {
    const editor = makeHeadlessEditor([Callout])
    editor.commands.setContent(
      '<div data-callout="" data-emoji="🌟"><p>Star</p></div>',
    )
    const json = editor.getJSON()
    const calloutNode = json.content?.[0]
    expect(calloutNode?.type).toBe('callout')
    expect(calloutNode?.attrs?.emoji).toBe('🌟')
    editor.destroy()
  })
})

// ---------------------------------------------------------------------------
// CalloutView – React render
// ---------------------------------------------------------------------------

describe('CalloutView component', () => {
  // Use a loose cast to avoid fighting with the full NodeViewProps signature,
  // which requires an `EditorView` that isn't available in jsdom unit tests.
  function makeMinimalProps(overrides: Record<string, unknown> = {}): NodeViewProps {
    const base = {
      node: {
        attrs: { emoji: '💡' },
        type: { name: 'callout' },
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

  it('renders the emoji from node.attrs', () => {
    render(<CalloutView {...makeMinimalProps()} />)
    expect(screen.getByText('💡')).toBeInTheDocument()
  })

  it('renders an editable content region (NodeViewContent)', () => {
    const { container } = render(<CalloutView {...makeMinimalProps()} />)
    expect(container.querySelector('[data-testid="callout-content"]')).toBeInTheDocument()
  })

  it('renders a custom emoji', () => {
    const props = makeMinimalProps({
      node: {
        attrs: { emoji: '🔥' },
        type: { name: 'callout' },
      },
    })
    render(<CalloutView {...props} />)
    expect(screen.getByText('🔥')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Slash-items registry – presence of Callout entry
// ---------------------------------------------------------------------------

describe('slashItems callout entry', () => {
  it('contains a Callout item', () => {
    expect(slashItems.some((i) => i.title === 'Callout')).toBe(true)
  })

  it('Callout item has correct shape', () => {
    const item = slashItems.find((i) => i.title === 'Callout')
    expect(item).toBeDefined()
    expect(item?.keywords).toContain('callout')
    expect(typeof item?.command).toBe('function')
  })
})
