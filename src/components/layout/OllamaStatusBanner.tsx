'use client'

import { useState } from 'react'

interface OllamaStatusBannerProps {
  ollamaAvailable: boolean
}

export function OllamaStatusBanner({ ollamaAvailable }: OllamaStatusBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (ollamaAvailable || dismissed) return null

  return (
    <div role="alert" className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between text-sm text-yellow-800">
      <span>
        AI features unavailable — Ollama is not running. Start it with{' '}
        <code className="font-mono bg-yellow-100 px-1 rounded">ollama serve</code>.
      </span>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="ml-4 text-yellow-600 hover:text-yellow-800 font-medium"
      >
        ×
      </button>
    </div>
  )
}
