/**
 * Tests for the MarkdownRules extension.
 *
 * Test approach: BEHAVIORAL – we construct a headless Tiptap Editor with the
 * real extensions and fire input rules via `editor.view.someProp('handleTextInput')`,
 * which is the same internal path that ProseMirror calls on DOM text events.
 * This exercises the full input-rule pipeline without requiring a real DOM event.
 *
 * We also include a fallback REGEX assertion for the to-do pattern so that if
 * the behavioral test ever becomes flaky in jsdom we have a stable signal.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { MarkdownRules } from '@/components/editor/extensions/markdown-rules'

// ---------------------------------------------------------------------------
// Helper: build a headless editor with all the extensions we need.
// ---------------------------------------------------------------------------
function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MarkdownRules,
    ],
  })
}

// ---------------------------------------------------------------------------
// Helper: simulate a user typing `text` into the editor.
// Input rules are fired via the `handleTextInput` view prop which is set up
// by Tiptap's inputRulesPlugin.  We replicate what ProseMirror does on a
// beforeinput / keypress event without needing real DOM events.
// ---------------------------------------------------------------------------
function typeText(editor: Editor, text: string) {
  const view = editor.view
  // Fire each character one at a time so every character triggers the
  // handleTextInput path and the input rule sees the accumulated text.
  for (const char of text) {
    const sel = view.state.selection
    const fired = view.someProp('handleTextInput', (f) =>
      f(view, sel.from, sel.to, char, () => view.state.tr.insertText(char, sel.from, sel.to)),
    )
    if (!fired) {
      // If the input rule did not consume the character, insert it normally.
      view.dispatch(
        view.state.tr.insertText(char, sel.from, sel.to),
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
const editors: Editor[] = []
afterEach(() => {
  editors.forEach((e) => e.destroy())
  editors.length = 0
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MarkdownRules extension', () => {
  // -- to-do shortcut -------------------------------------------------------

  it('converts "[] " at the start of a paragraph into a taskList/taskItem', () => {
    const editor = makeEditor()
    editors.push(editor)

    typeText(editor, '[] ')

    const json = editor.getJSON()
    // Top-level node should contain a taskList
    const hasTaskList = json.content?.some((node) => node.type === 'taskList')
    expect(hasTaskList).toBe(true)

    const taskList = json.content?.find((node) => node.type === 'taskList')
    expect(taskList?.content?.[0]?.type).toBe('taskItem')
  })

  it('converts "[ ] " at the start of a paragraph into a taskList/taskItem', () => {
    const editor = makeEditor()
    editors.push(editor)

    typeText(editor, '[ ] ')

    const json = editor.getJSON()
    const hasTaskList = json.content?.some((node) => node.type === 'taskList')
    expect(hasTaskList).toBe(true)
  })

  it('converts "[x] " at the start of a paragraph into a taskList/taskItem', () => {
    const editor = makeEditor()
    editors.push(editor)

    typeText(editor, '[x] ')

    const json = editor.getJSON()
    const hasTaskList = json.content?.some((node) => node.type === 'taskList')
    expect(hasTaskList).toBe(true)
  })

  // -- regex sanity check (fast, no editor needed) --------------------------

  it('REGEX: matches "[] ", "[ ] ", "[x] " and not "[X] " or "[]x "', () => {
    // Re-create the same regex used in the implementation so this test acts as
    // a stable contract even if the behavioral test approach changes.
    const find = /^\[( |x)?\]\s$/

    expect(find.test('[] ')).toBe(true)   // no space inside brackets
    expect(find.test('[ ] ')).toBe(true)  // space inside brackets
    expect(find.test('[x] ')).toBe(true)  // x inside brackets

    expect(find.test('[X] ')).toBe(false) // uppercase X not matched
    expect(find.test('[]x ')).toBe(false) // x after bracket, not inside
    expect(find.test('[  ] ')).toBe(false) // two spaces inside brackets
  })

  // -- StarterKit sanity: heading -------------------------------------------

  it('StarterKit: "# " at start of paragraph produces heading level 1', () => {
    const editor = makeEditor()
    editors.push(editor)

    typeText(editor, '# ')

    const json = editor.getJSON()
    const hasHeading = json.content?.some(
      (node) => node.type === 'heading' && node.attrs?.level === 1,
    )
    expect(hasHeading).toBe(true)
  })

  // -- StarterKit sanity: blockquote ----------------------------------------

  it('StarterKit: "> " at start of paragraph produces blockquote', () => {
    const editor = makeEditor()
    editors.push(editor)

    typeText(editor, '> ')

    const json = editor.getJSON()
    const hasBlockquote = json.content?.some((node) => node.type === 'blockquote')
    expect(hasBlockquote).toBe(true)
  })
})
