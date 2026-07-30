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

  it('renders toolbar with bold and italic buttons', () => {
    render(<BlockEditor doc={emptyDoc} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument()
  })
})
