'use client'

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

export function CalloutView({ node }: NodeViewProps) {
  // The schema default guarantees `emoji` is always populated by render time.
  const emoji = node.attrs.emoji as string

  return (
    <NodeViewWrapper
      data-callout=""
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-start',
        padding: '0.75rem 1rem',
        borderRadius: 8,
        border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)',
        background: 'var(--accent)',
        margin: '0.5rem 0',
      }}
    >
      <span
        contentEditable={false}
        role="img"
        aria-label="Callout icon"
        style={{ fontSize: '1.1rem', lineHeight: 1.6, userSelect: 'none' }}
      >
        {emoji}
      </span>
      <NodeViewContent data-testid="callout-content" style={{ flex: 1 }} />
    </NodeViewWrapper>
  )
}
