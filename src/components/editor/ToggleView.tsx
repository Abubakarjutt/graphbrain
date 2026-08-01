'use client'

import { useState } from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

export function ToggleView({ node }: NodeViewProps) {
  // Collapse state is view-only — never written to node attrs (per spec).
  const [open, setOpen] = useState(true)
  // Inline summary editing is deferred to a later phase; the attr round-trips
  // so stored titles survive, but Phase A has no UI to set it, so it renders
  // the "Toggle" placeholder.
  const summary = node.attrs.summary as string

  return (
    <NodeViewWrapper
      data-toggle=""
      style={{
        margin: '0.25rem 0',
      }}
    >
      <button
        type="button"
        contentEditable={false}
        aria-label="Toggle section"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.1rem 0',
          fontSize: 'inherit',
          color: 'inherit',
          fontWeight: 500,
          userSelect: 'none',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '0.7rem' }}>
          {open ? '▾' : '▸'}
        </span>
        {summary || 'Toggle'}
      </button>
      {/* Keep NodeViewContent mounted and hide via CSS: unmounting it detaches
          ProseMirror's contentDOM and can silently drop the toggle's children. */}
      <NodeViewContent
        data-testid="toggle-content"
        style={{ paddingLeft: '1.25rem', display: open ? undefined : 'none' }}
      />
    </NodeViewWrapper>
  )
}
