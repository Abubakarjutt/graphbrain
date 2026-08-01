'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BubbleMenuButtonsProps {
  editor: Editor
}

interface EditorBubbleMenuProps {
  editor: Editor | null
}

// ─── Presentational button row (separately testable) ─────────────────────────

export function BubbleMenuButtons({ editor }: BubbleMenuButtonsProps) {
  // ── Inline formatting ──
  const handleBold = () => {
    editor.chain().focus().toggleBold().run()
  }

  const handleItalic = () => {
    editor.chain().focus().toggleItalic().run()
  }

  const handleCode = () => {
    editor.chain().focus().toggleCode().run()
  }

  const handleLink = () => {
    const url = window.prompt('Enter URL')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
  }

  // ── Turn into ──
  const handleParagraph = () => {
    editor.chain().focus().setParagraph().run()
  }

  const handleHeading = (level: 1 | 2 | 3) => {
    editor.chain().focus().toggleHeading({ level }).run()
  }

  const handleBlockquote = () => {
    editor.chain().focus().toggleBlockquote().run()
  }

  // ── Shared button class builders ──
  const baseBtn =
    'inline-flex items-center justify-center rounded px-2 py-1 text-xs font-medium' +
    ' text-popover-foreground transition-colors' +
    ' hover:bg-[color-mix(in_oklch,var(--gold)_15%,transparent)]' +
    ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]'

  const activeBtn = 'bg-[color-mix(in_oklch,var(--gold)_25%,transparent)] text-[var(--gold-deep)]'

  const btnClass = (active: boolean) =>
    `${baseBtn} ${active ? activeBtn : ''}`.trim()

  return (
    <div
      className={
        'flex items-center gap-0.5 rounded-lg border border-border' +
        ' bg-popover px-1 py-1 shadow-lg'
      }
    >
      {/* ── Inline formatting group ── */}
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={editor.isActive('bold')}
        className={btnClass(editor.isActive('bold'))}
        onClick={handleBold}
      >
        B
      </button>

      <button
        type="button"
        aria-label="Italic"
        aria-pressed={editor.isActive('italic')}
        className={btnClass(editor.isActive('italic'))}
        onClick={handleItalic}
      >
        <em>I</em>
      </button>

      <button
        type="button"
        aria-label="Code"
        aria-pressed={editor.isActive('code')}
        className={btnClass(editor.isActive('code'))}
        onClick={handleCode}
      >
        {'</>'}
      </button>

      <button
        type="button"
        aria-label="Link"
        aria-pressed={editor.isActive('link')}
        className={btnClass(editor.isActive('link'))}
        onClick={handleLink}
      >
        🔗
      </button>

      {/* ── Divider ── */}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      {/* ── Turn into group ── */}
      <button
        type="button"
        aria-label="Paragraph"
        aria-pressed={editor.isActive('paragraph')}
        className={btnClass(editor.isActive('paragraph'))}
        onClick={handleParagraph}
      >
        P
      </button>

      <button
        type="button"
        aria-label="Heading 1"
        aria-pressed={editor.isActive('heading', { level: 1 })}
        className={btnClass(editor.isActive('heading', { level: 1 }))}
        onClick={() => handleHeading(1)}
      >
        H1
      </button>

      <button
        type="button"
        aria-label="Heading 2"
        aria-pressed={editor.isActive('heading', { level: 2 })}
        className={btnClass(editor.isActive('heading', { level: 2 }))}
        onClick={() => handleHeading(2)}
      >
        H2
      </button>

      <button
        type="button"
        aria-label="Heading 3"
        aria-pressed={editor.isActive('heading', { level: 3 })}
        className={btnClass(editor.isActive('heading', { level: 3 }))}
        onClick={() => handleHeading(3)}
      >
        H3
      </button>

      <button
        type="button"
        aria-label="Quote"
        aria-pressed={editor.isActive('blockquote')}
        className={btnClass(editor.isActive('blockquote'))}
        onClick={handleBlockquote}
      >
        "
      </button>
    </div>
  )
}

// ─── Positioning wrapper (uses BubbleMenu from @tiptap/react/menus) ──────────

export default function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top-start' }}
    >
      <BubbleMenuButtons editor={editor} />
    </BubbleMenu>
  )
}
