import { Extension, type Editor } from '@tiptap/core'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { SlashMenu, type SlashMenuHandle } from '@/components/editor/SlashMenu'
import { filterSlashItems, type SlashItem } from '@/components/editor/extensions/slash-items'
import type { Range } from '@tiptap/core'

// Extracted from the inline `render: () => {...}` factory so it can be unit
// tested directly with hand-crafted SuggestionProps, the same way Callout's
// node view is tested separately from the Callout extension itself.
export function createSlashSuggestionRenderer() {
  let renderer: ReactRenderer<SlashMenuHandle> | null = null
  let unmount: (() => void) | null = null

  return {
    onStart: (props: SuggestionProps<SlashItem>) => {
      renderer = new ReactRenderer(SlashMenu, {
        props: {
          items: props.items,
          onSelect: (item: SlashItem) => props.command(item),
          onClose: () => {
            if (unmount) {
              unmount()
              unmount = null
            }
            renderer?.destroy()
            renderer = null
          },
        },
        editor: props.editor,
      })

      if (!renderer.element) {
        // Surface silent mount failures during development rather than
        // leaving the suggestion popup invisibly broken.
        console.warn('SlashCommand: ReactRenderer produced no element; menu not mounted')
        return
      }

      const el = renderer.element as HTMLElement

      // Position below caret
      const rect = props.clientRect?.()
      if (rect) {
        el.style.position = 'fixed'
        el.style.left = `${rect.left}px`
        el.style.top = `${rect.bottom + 4}px`
        el.style.zIndex = '9999'
      }

      document.body.appendChild(el)
      unmount = () => {
        el.remove()
      }
    },

    onUpdate: (props: SuggestionProps<SlashItem>) => {
      renderer?.updateProps({
        items: props.items,
        onSelect: (item: SlashItem) => props.command(item),
      })

      const rect = props.clientRect?.()
      if (rect && renderer?.element) {
        const el = renderer.element as HTMLElement
        el.style.left = `${rect.left}px`
        el.style.top = `${rect.bottom + 4}px`
      }
    },

    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (!renderer?.ref) return false
      return renderer.ref.onKeyDown(event)
    },

    onExit: () => {
      if (unmount) {
        unmount()
        unmount = null
      }
      renderer?.destroy()
      renderer = null
    },
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    const editor: Editor = this.editor
    return [
      Suggestion({
        editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }: { query: string }) => filterSlashItems(query),
        command: ({
          editor: cmdEditor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: SlashItem
        }) => {
          props.command(cmdEditor, range)
        },
        render: createSlashSuggestionRenderer,
      }),
    ]
  },
})
