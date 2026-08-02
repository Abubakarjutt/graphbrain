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
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 flex items-center justify-between text-sm text-amber-700 dark:text-amber-400"
    >
      <span>
        AI features unavailable — Ollama is not running. Start it with{' '}
        <code className="font-mono px-1 rounded bg-amber-500/15">
          ollama serve
        </code>
        .
      </span>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="ml-4 font-medium transition-opacity hover:opacity-70"
      >
        ×
      </button>
    </div>
  )
}
