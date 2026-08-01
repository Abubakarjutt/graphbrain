'use client'

import { useState } from 'react'

interface OllamaStatusBannerProps {
  ollamaAvailable: boolean
}

export function OllamaStatusBanner({ ollamaAvailable }: OllamaStatusBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (ollamaAvailable || dismissed) return null

  return (
    <div
      role="alert"
      className="border-b px-4 py-2 flex items-center justify-between text-sm"
      style={{
        background: 'oklch(0.78 0.11 79 / 10%)',
        borderColor: 'oklch(0.78 0.11 79 / 30%)',
        color: 'var(--gold)',
      }}
    >
      <span>
        AI features unavailable — Ollama is not running. Start it with{' '}
        <code
          className="font-mono px-1 rounded"
          style={{ background: 'oklch(0.78 0.11 79 / 15%)' }}
        >
          ollama serve
        </code>
        .
      </span>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="ml-4 font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--gold-deep)' }}
      >
        ×
      </button>
    </div>
  )
}
