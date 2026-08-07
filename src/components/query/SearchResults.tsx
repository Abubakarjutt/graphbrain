'use client'

import Link from 'next/link'
import type { SearchResult } from '@/lib/types/database'

interface SearchResultsProps {
  results: SearchResult[]
  workspaceId: string
  onNavigate: () => void
}

function entityHref(workspaceId: string, result: SearchResult): string {
  return `/workspace/${workspaceId}/page/${result.entityId}`
}

export function SearchResults({ results, workspaceId, onNavigate }: SearchResultsProps) {
  if (results.length === 0) return null

  const byProject = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r.projectName ?? '__standalone__'
    acc[key] = [...(acc[key] ?? []), r]
    return acc
  }, {})

  return (
    <div>
      {Object.entries(byProject).map(([projectKey, items]) => (
        <div key={projectKey}>
          {projectKey !== '__standalone__' && (
            <p
              className="px-4 pt-3 pb-1.5 text-[10px] font-bold tracking-[0.10em] uppercase"
              style={{ color: 'var(--muted-foreground)', opacity: 0.55 }}
            >
              {projectKey}
            </p>
          )}
          {items.map(result => (
            <Link
              key={result.nodeId || result.entityId}
              href={entityHref(workspaceId, result)}
              onClick={onNavigate}
              className="flex items-start gap-3 px-4 py-2.5 transition-colors group"
              style={{ color: 'var(--foreground)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="mt-[1px] shrink-0" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} aria-hidden>
                <path d="M3 2h5.5L10 3.5V11H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                <path d="M8.5 2v1.5H10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium truncate">{result.title}</p>
                {result.excerpt && (
                  <p className="text-[12px] line-clamp-1 mt-0.5" style={{ color: 'var(--muted-foreground)', opacity: 0.65 }}>
                    {result.excerpt}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}
