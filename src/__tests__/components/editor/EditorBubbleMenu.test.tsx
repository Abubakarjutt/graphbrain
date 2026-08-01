import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BubbleMenuButtons } from '@/components/editor/EditorBubbleMenu'

// Build a mock editor chain that allows fluent chaining and spying
function makeMockEditor(isActiveFn: (name: string, opts?: unknown) => boolean = () => false) {
  const run = vi.fn()
  const chain = {
    focus: vi.fn().mockReturnThis(),
    toggleBold: vi.fn().mockReturnThis(),
    toggleItalic: vi.fn().mockReturnThis(),
    toggleCode: vi.fn().mockReturnThis(),
    setLink: vi.fn().mockReturnThis(),
    unsetLink: vi.fn().mockReturnThis(),
    toggleHeading: vi.fn().mockReturnThis(),
    setParagraph: vi.fn().mockReturnThis(),
    toggleBlockquote: vi.fn().mockReturnThis(),
    run,
  }
  const editor = {
    chain: vi.fn(() => chain),
    isActive: vi.fn(isActiveFn),
    __chain: chain, // expose for assertions
  }
  return { editor, chain, run }
}

describe('BubbleMenuButtons', () => {
  it('renders Bold, Italic, and Code buttons', () => {
    const { editor } = makeMockEditor()
    render(<BubbleMenuButtons editor={editor as never} />)

    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /code/i })).toBeInTheDocument()
  })

  it('clicking Bold button calls toggleBold then run', async () => {
    const user = userEvent.setup()
    const { editor, chain, run } = makeMockEditor()
    render(<BubbleMenuButtons editor={editor as never} />)

    await user.click(screen.getByRole('button', { name: /bold/i }))

    expect(editor.chain).toHaveBeenCalled()
    expect(chain.focus).toHaveBeenCalled()
    expect(chain.toggleBold).toHaveBeenCalled()
    expect(run).toHaveBeenCalled()
  })

  it('clicking Italic button calls toggleItalic then run', async () => {
    const user = userEvent.setup()
    const { editor, chain, run } = makeMockEditor()
    render(<BubbleMenuButtons editor={editor as never} />)

    await user.click(screen.getByRole('button', { name: /italic/i }))

    expect(chain.toggleItalic).toHaveBeenCalled()
    expect(run).toHaveBeenCalled()
  })

  it('clicking Code button calls toggleCode then run', async () => {
    const user = userEvent.setup()
    const { editor, chain, run } = makeMockEditor()
    render(<BubbleMenuButtons editor={editor as never} />)

    await user.click(screen.getByRole('button', { name: /^code$/i }))

    expect(chain.toggleCode).toHaveBeenCalled()
    expect(run).toHaveBeenCalled()
  })

  it('Bold button has aria-pressed="false" when bold is not active', () => {
    const { editor } = makeMockEditor(() => false)
    render(<BubbleMenuButtons editor={editor as never} />)

    const boldBtn = screen.getByRole('button', { name: /bold/i })
    expect(boldBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('Bold button has aria-pressed="true" when bold is active', () => {
    const { editor } = makeMockEditor((name: string) => name === 'bold')
    render(<BubbleMenuButtons editor={editor as never} />)

    const boldBtn = screen.getByRole('button', { name: /bold/i })
    expect(boldBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('Italic button reflects active state', () => {
    const { editor } = makeMockEditor((name: string) => name === 'italic')
    render(<BubbleMenuButtons editor={editor as never} />)

    const italicBtn = screen.getByRole('button', { name: /italic/i })
    expect(italicBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders Turn into buttons: Paragraph, H1, H2, H3, Quote', () => {
    const { editor } = makeMockEditor()
    render(<BubbleMenuButtons editor={editor as never} />)

    expect(screen.getByRole('button', { name: /paragraph/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /heading 1|h1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /heading 2|h2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /heading 3|h3/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quote/i })).toBeInTheDocument()
  })

  it('clicking H1 button calls toggleHeading with level 1', async () => {
    const user = userEvent.setup()
    const { editor, chain, run } = makeMockEditor()
    render(<BubbleMenuButtons editor={editor as never} />)

    await user.click(screen.getByRole('button', { name: /heading 1|h1/i }))

    expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 1 })
    expect(run).toHaveBeenCalled()
  })

  it('clicking Quote button calls toggleBlockquote', async () => {
    const user = userEvent.setup()
    const { editor, chain, run } = makeMockEditor()
    render(<BubbleMenuButtons editor={editor as never} />)

    await user.click(screen.getByRole('button', { name: /quote/i }))

    expect(chain.toggleBlockquote).toHaveBeenCalled()
    expect(run).toHaveBeenCalled()
  })

  it('clicking Link button calls setLink when user provides a URL', async () => {
    const user = userEvent.setup()
    const { editor, chain, run } = makeMockEditor()
    // Mock window.prompt to return a URL
    vi.spyOn(window, 'prompt').mockReturnValue('https://example.com')

    render(<BubbleMenuButtons editor={editor as never} />)
    await user.click(screen.getByRole('button', { name: /link/i }))

    expect(chain.setLink).toHaveBeenCalledWith({ href: 'https://example.com' })
    expect(run).toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('clicking Link button calls unsetLink when user cancels the prompt', async () => {
    const user = userEvent.setup()
    const { editor, chain, run } = makeMockEditor()
    // Mock window.prompt to return null (user cancelled)
    vi.spyOn(window, 'prompt').mockReturnValue(null)

    render(<BubbleMenuButtons editor={editor as never} />)
    await user.click(screen.getByRole('button', { name: /link/i }))

    expect(chain.unsetLink).toHaveBeenCalled()
    expect(run).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
