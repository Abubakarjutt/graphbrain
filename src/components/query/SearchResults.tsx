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
    <div className="divide-y divide-border">
      {Object.entries(byProject).map(([projectKey, items]) => (
        <div key={projectKey} className="py-2">
          {projectKey !== '__standalone__' && (
            <p className="px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {projectKey}
            </p>
          )}
          {items.map(result => (
            <Link
              key={result.nodeId || result.entityId}
              href={entityHref(workspaceId, result)}
              onClick={onNavigate}
              className="flex flex-col px-4 py-2 hover:bg-accent rounded-md group"
            >
              <span className="text-sm font-medium group-hover:text-accent-foreground">
                {result.title}
              </span>
              {result.excerpt && (
                <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {result.excerpt}
                </span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}
