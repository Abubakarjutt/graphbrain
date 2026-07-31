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
      <div className="px-4 py-6 text-sm text-muted-foreground animate-pulse">
        Searching knowledge graph…
      </div>
    )
  }

  if (!response) return null

  return (
    <div className="px-4 py-4 space-y-4">
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{response}</p>
      {sources.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
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
