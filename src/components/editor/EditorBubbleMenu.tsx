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
    ' hover:bg-accent' +
    ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  const activeBtn = 'bg-accent text-accent-foreground'

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
      <button type="button" aria-label="Bold" aria-pressed={editor.isActive('bold')} className={btnClass(editor.isActive('bold'))} onClick={handleBold}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M3.5 7h4a2 2 0 0 0 0-4H3.5v4zm0 0h4.5a2.5 2.5 0 0 1 0 5H3.5V7z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      <button type="button" aria-label="Italic" aria-pressed={editor.isActive('italic')} className={btnClass(editor.isActive('italic'))} onClick={handleItalic}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><line x1="9" y1="2" x2="5" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="6" y1="2" x2="10" y2="2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
      </button>

      <button type="button" aria-label="Code" aria-pressed={editor.isActive('code')} className={btnClass(editor.isActive('code'))} onClick={handleCode}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><polyline points="4,4 1,7 4,10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><polyline points="10,4 13,7 10,10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      <button type="button" aria-label="Link" aria-pressed={editor.isActive('link')} className={btnClass(editor.isActive('link'))} onClick={handleLink}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M5.5 8.5a3.5 3.5 0 0 0 5 0l1.5-1.5a3.5 3.5 0 0 0-5-5L6 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8.5 5.5a3.5 3.5 0 0 0-5 0L2 7a3.5 3.5 0 0 0 5 5l1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
      </button>

      {/* ── Divider ── */}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      {/* ── Turn into group ── */}
      <button type="button" aria-label="Paragraph" aria-pressed={editor.isActive('paragraph')} className={btnClass(editor.isActive('paragraph'))} onClick={handleParagraph}>
        <span className="text-[11px] font-medium leading-none">¶</span>
      </button>

      <button type="button" aria-label="Heading 1" aria-pressed={editor.isActive('heading', { level: 1 })} className={btnClass(editor.isActive('heading', { level: 1 }))} onClick={() => handleHeading(1)}>
        <span className="text-[11px] font-semibold leading-none">H1</span>
      </button>

      <button type="button" aria-label="Heading 2" aria-pressed={editor.isActive('heading', { level: 2 })} className={btnClass(editor.isActive('heading', { level: 2 }))} onClick={() => handleHeading(2)}>
        <span className="text-[11px] font-semibold leading-none">H2</span>
      </button>

      <button type="button" aria-label="Heading 3" aria-pressed={editor.isActive('heading', { level: 3 })} className={btnClass(editor.isActive('heading', { level: 3 }))} onClick={() => handleHeading(3)}>
        <span className="text-[11px] font-semibold leading-none">H3</span>
      </button>

      <button type="button" aria-label="Quote" aria-pressed={editor.isActive('blockquote')} className={btnClass(editor.isActive('blockquote'))} onClick={handleBlockquote}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M2 5h4v4H2zM8 5h4v4H8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M6 9c0 1.5-1 2.5-2 3M12 9c0 1.5-1 2.5-2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
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
