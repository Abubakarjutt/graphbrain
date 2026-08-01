import { Extension, wrappingInputRule } from '@tiptap/core'

/**
 * MarkdownRules extension.
 *
 * Adds the to-do shortcut: typing `[] `, `[ ] `, or `[x] ` at the start of
 * an empty paragraph creates a task list item.
 *
 * Heading, blockquote, horizontal-rule, bullet, numbered-list, and code-block
 * input rules are already provided by StarterKit, so this extension only
 * supplies the task-list shortcut that StarterKit does not cover.
 */
export const MarkdownRules = Extension.create({
  name: 'markdownRules',

  addInputRules() {
    return [
      // Matches: [] , [ ] , [x]  (trailing whitespace is consumed by the rule)
      wrappingInputRule({
        find: /^\[( |x)?\]\s$/,
        type: this.editor.schema.nodes.taskList,
      }),
    ]
  },
})
