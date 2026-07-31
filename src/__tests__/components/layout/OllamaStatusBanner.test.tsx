import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OllamaStatusBanner } from '@/components/layout/OllamaStatusBanner'

describe('OllamaStatusBanner', () => {
  it('renders the banner when ollamaAvailable is false', () => {
    render(<OllamaStatusBanner ollamaAvailable={false} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/AI features unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/ollama serve/i)).toBeInTheDocument()
  })

  it('does not render when ollamaAvailable is true', () => {
    render(<OllamaStatusBanner ollamaAvailable={true} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('dismiss button removes the banner', async () => {
    render(<OllamaStatusBanner ollamaAvailable={false} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
