'use client'

import Link from 'next/link'
import type { SearchResult } from '@/lib/types/database'

interface AskPanelProps {
  response: string
  sources: SearchResult[]
  loading: boolean
  error: string | null
  workspaceId: string
}

export function AskPanel({ response, sources, loading, error, workspaceId }: AskPanelProps) {
  if (error) return <div className="px-4 py-6 text-sm text-destructive">{error}</div>

  if (loading && !response) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <svg width="13" height="13" viewBox="0 0 11 11" fill="none" className="text-spark animate-pulse shrink-0" aria-hidden>
          <path d="M5.5 1 6.7 4.3 10 5.5 6.7 6.7 5.5 10 4.3 6.7 1 5.5 4.3 4.3z" fill="currentColor" />
        </svg>
        Searching knowledge graph…
      </div>
    )
  }

  if (!response) return null

  return (
    <div className="px-4 py-4 space-y-4 border-l-2 border-spark/40">
      <p className="text-sm leading-relaxed whitespace-pre-wrap pl-3">{response}</p>
      {sources.length > 0 && (
        <div className="pl-3">
          <p className="text-xs font-semibold text-spark uppercase tracking-wider mb-1">
            Sources
          </p>
          <ul className="space-y-1">
            {sources.map(s => (
              <li key={s.nodeId || s.entityId}>
                <Link
                  href={`/workspace/${workspaceId}/page/${s.entityId}`}
                  className="text-xs text-primary hover:underline"
                >
                  {s.title}
                  {s.projectName && (
                    <span className="text-muted-foreground"> ({s.projectName})</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
