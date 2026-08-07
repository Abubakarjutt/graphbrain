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
      className="flex items-center justify-between px-4 py-2 text-[12.5px]"
      style={{
        background: 'oklch(0.82 0.10 78 / 10%)',
        borderBottom: '1px solid oklch(0.72 0.12 78 / 25%)',
        color: 'oklch(0.50 0.12 78)',
      }}
    >
      <span className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ opacity: 0.7 }}>
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 4v2.5M6 8.5v.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        AI features unavailable — Ollama is not running. Start with{' '}
        <code className="font-mono px-1 py-0.5 rounded text-[11px]" style={{ background: 'oklch(0.72 0.12 78 / 15%)' }}>
          ollama serve
        </code>
      </span>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="ml-4 h-5 w-5 grid place-items-center rounded opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
        style={{ color: 'inherit' }}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
