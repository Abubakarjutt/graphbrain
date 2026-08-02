import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSlashSuggestionRenderer } from '@/components/editor/extensions/SlashCommand'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { SlashItem } from '@/components/editor/extensions/slash-items'
import type { Editor } from '@tiptap/core'

// ReactRenderer's own rendering isn't SlashCommand's responsibility to
// verify (SlashMenu itself is tested separately) — mocked here so this file
// tests exactly the mount/position/update/cleanup glue that SlashCommand
// owns, deterministically.
let mockElement: HTMLElement | null
const mockDestroy = vi.fn()
const mockUpdateProps = vi.fn()
const mockRefOnKeyDown = vi.fn()

vi.mock('@tiptap/react', () => ({
  ReactRenderer: vi.fn().mockImplementation(function () {
    return {
      element: mockElement,
      ref: { onKeyDown: mockRefOnKeyDown },
      destroy: mockDestroy,
      updateProps: mockUpdateProps,
    }
  }),
}))

const fakeItems: SlashItem[] = [
  { title: 'Text', keywords: ['text'], group: 'Basic', command: vi.fn() },
]

function fakeRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    left: 10, top: 20, right: 40, bottom: 30, width: 30, height: 10, x: 10, y: 20,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect
}

function makeSuggestionProps(overrides: Partial<SuggestionProps<SlashItem>> = {}): SuggestionProps<SlashItem> {
  return {
    editor: {} as Editor,
    range: { from: 0, to: 1 },
    query: '',
    text: '/',
    items: fakeItems,
    command: vi.fn(),
    clientRect: () => fakeRect(),
    ...overrides,
  } as unknown as SuggestionProps<SlashItem>
}

describe('createSlashSuggestionRenderer', () => {
  beforeEach(() => {
    mockElement = document.createElement('div')
    mockDestroy.mockClear()
    mockUpdateProps.mockClear()
    mockRefOnKeyDown.mockClear().mockReturnValue(true)
    vi.mocked(ReactRenderer).mockClear()
    document.body.innerHTML = ''
  })

  it('mounts the menu element into the document body on start', () => {
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps())
    expect(document.body.contains(mockElement)).toBe(true)
  })

  it('positions the menu below the caret using clientRect', () => {
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps())
    expect(mockElement!.style.position).toBe('fixed')
    expect(mockElement!.style.left).toBe('10px')
    expect(mockElement!.style.top).toBe('34px')
  })

  it('still mounts the element when clientRect returns null, without crashing', () => {
    const lifecycle = createSlashSuggestionRenderer()
    expect(() => lifecycle.onStart(makeSuggestionProps({ clientRect: () => null }))).not.toThrow()
    expect(document.body.contains(mockElement)).toBe(true)
    expect(mockElement!.style.position).toBe('')
  })

  it('warns and mounts nothing when the renderer produces no element', () => {
    mockElement = null
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lifecycle = createSlashSuggestionRenderer()

    lifecycle.onStart(makeSuggestionProps())

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('menu not mounted'))
    expect(document.body.children.length).toBe(0)
    warnSpy.mockRestore()
  })

  it('invokes the suggestion command when the menu reports a selection', () => {
    const command = vi.fn()
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps({ command }))

    const passedProps = vi.mocked(ReactRenderer).mock.calls[0][1] as unknown as { props: { onSelect: (item: SlashItem) => void } }
    passedProps.props.onSelect(fakeItems[0])

    expect(command).toHaveBeenCalledWith(fakeItems[0])
  })

  it("removes the element and destroys the renderer when the menu closes itself", () => {
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps())
    expect(document.body.contains(mockElement)).toBe(true)

    const passedProps = vi.mocked(ReactRenderer).mock.calls[0][1] as unknown as { props: { onClose: () => void } }
    passedProps.props.onClose()

    expect(document.body.contains(mockElement)).toBe(false)
    expect(mockDestroy).toHaveBeenCalledTimes(1)
  })

  it('updates the mounted menu with new items and repositions it', () => {
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps())

    lifecycle.onUpdate(makeSuggestionProps({
      items: [],
      clientRect: () => fakeRect({ left: 99, bottom: 50 }),
    }))

    expect(mockUpdateProps).toHaveBeenCalledWith(expect.objectContaining({ items: [] }))
    expect(mockElement!.style.left).toBe('99px')
    expect(mockElement!.style.top).toBe('54px')
  })

  it('does nothing on update before the menu has started', () => {
    const lifecycle = createSlashSuggestionRenderer()
    expect(() => lifecycle.onUpdate(makeSuggestionProps())).not.toThrow()
    expect(mockUpdateProps).not.toHaveBeenCalled()
  })

  it('delegates key events to the menu and returns its result', () => {
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps())

    const handled = lifecycle.onKeyDown({ event: new KeyboardEvent('keydown') } as SuggestionKeyDownProps)

    expect(handled).toBe(true)
    expect(mockRefOnKeyDown).toHaveBeenCalledTimes(1)
  })

  it('returns false for key events before the menu has started', () => {
    const lifecycle = createSlashSuggestionRenderer()
    const handled = lifecycle.onKeyDown({ event: new KeyboardEvent('keydown') } as SuggestionKeyDownProps)
    expect(handled).toBe(false)
    expect(mockRefOnKeyDown).not.toHaveBeenCalled()
  })

  it('removes the element and destroys the renderer on exit', () => {
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps())

    lifecycle.onExit()

    expect(document.body.contains(mockElement)).toBe(false)
    expect(mockDestroy).toHaveBeenCalledTimes(1)
  })

  it('does not throw or double-destroy when exited twice', () => {
    const lifecycle = createSlashSuggestionRenderer()
    lifecycle.onStart(makeSuggestionProps())
    lifecycle.onExit()

    expect(() => lifecycle.onExit()).not.toThrow()
    expect(mockDestroy).toHaveBeenCalledTimes(1)
  })

  it('keeps separate menu instances independent', () => {
    const lifecycleA = createSlashSuggestionRenderer()
    lifecycleA.onStart(makeSuggestionProps())
    const elementA = mockElement

    mockElement = document.createElement('div')
    const lifecycleB = createSlashSuggestionRenderer()
    lifecycleB.onStart(makeSuggestionProps())

    lifecycleA.onExit()

    expect(document.body.contains(elementA)).toBe(false)
    expect(document.body.contains(mockElement)).toBe(true)
  })
})
