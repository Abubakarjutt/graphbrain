import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlashMenu } from '@/components/editor/SlashMenu'
import { slashItems } from '@/components/editor/extensions/slash-items'

describe('SlashMenu', () => {
  it('renders all item titles', () => {
    render(<SlashMenu items={slashItems} onSelect={vi.fn()} onClose={vi.fn()} />)
    for (const item of slashItems) {
      expect(screen.getByText(item.title)).toBeInTheDocument()
    }
  })

  it('renders group headers Basic and Media', () => {
    render(<SlashMenu items={slashItems} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('BASIC')).toBeInTheDocument()
    expect(screen.getByText('MEDIA')).toBeInTheDocument()
  })

  it('has role listbox and options have role option', () => {
    render(<SlashMenu items={slashItems} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(slashItems.length)
  })

  it('ArrowDown then Enter calls onSelect with second item', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SlashMenu items={slashItems} onSelect={onSelect} onClose={vi.fn()} />,
    )
    const listbox = container.querySelector('[role="listbox"]')!
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    fireEvent.keyDown(listbox, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(slashItems[1])
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <SlashMenu items={slashItems} onSelect={vi.fn()} onClose={onClose} />,
    )
    const listbox = container.querySelector('[role="listbox"]')!
    fireEvent.keyDown(listbox, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking an option calls onSelect with that item', () => {
    const onSelect = vi.fn()
    render(<SlashMenu items={slashItems} onSelect={onSelect} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Quote'))
    const quoteItem = slashItems.find((i) => i.title === 'Quote')!
    expect(onSelect).toHaveBeenCalledWith(quoteItem)
  })

  it('first item is selected by default (aria-selected)', () => {
    render(<SlashMenu items={slashItems} onSelect={vi.fn()} onClose={vi.fn()} />)
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('ArrowUp wraps around to last item', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <SlashMenu items={slashItems} onSelect={onSelect} onClose={vi.fn()} />,
    )
    const listbox = container.querySelector('[role="listbox"]')!
    fireEvent.keyDown(listbox, { key: 'ArrowUp' })
    fireEvent.keyDown(listbox, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(slashItems[slashItems.length - 1])
  })
})
