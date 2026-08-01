import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BlockEditor } from '@/components/editor/BlockEditor'
import type { TiptapDocument } from '@/lib/types/database'

const emptyDoc: TiptapDocument = { type: 'doc', content: [] }

describe('BlockEditor', () => {
  it('renders without crashing', () => {
    render(<BlockEditor doc={emptyDoc} onSave={vi.fn()} />)
    expect(document.querySelector('.ProseMirror')).toBeInTheDocument()
  })

  it('does not render a fixed toolbar', () => {
    render(<BlockEditor doc={emptyDoc} onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /bold/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /italic/i })).toBeNull()
  })
})
