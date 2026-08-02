'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAsk } from '@/lib/hooks/useAsk'
import type { QueryLog } from '@/lib/types/database'

interface ScopeOption {
  id: string
  title: string
}

interface AskPageClientProps {
  workspaceId: string
  scopeOptions: ScopeOption[]
  recentQueries: QueryLog[]
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 11 11" fill="none" className={className} aria-hidden>
      <path d="M5.5 1 6.7 4.3 10 5.5 6.7 6.7 5.5 10 4.3 6.7 1 5.5 4.3 4.3z" fill="currentColor" />
    </svg>
  )
}

export function AskPageClient({ workspaceId, scopeOptions, recentQueries }: AskPageClientProps) {
  const { query, setQuery, scope, setScope, response, sources, loading, error, ask, reset, loadSaved } = useAsk(workspaceId)
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const autoAskedRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !autoAskedRef.current) {
      autoAskedRef.current = true
      ask(q)
    }
    // Only ever auto-run once per page load, regardless of later query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const hasAsked = loading || response || error || query

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-14">
        <div className="flex items-center gap-2 mb-8">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-spark/15 shrink-0">
            <SparkIcon className="text-spark" />
          </span>
          <h1 className="font-display text-2xl font-medium text-foreground">Ask</h1>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); ask() }}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm focus-within:border-ring transition-colors"
        >
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask anything about your knowledge graph…"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            aria-label="Ask a question"
          />
          <select
            value={scope.databaseId ?? ''}
            onChange={e => setScope(e.target.value ? { databaseId: e.target.value } : {})}
            className="text-xs bg-transparent border border-border rounded px-2 py-1 text-muted-foreground shrink-0"
            aria-label="Scope"
          >
            <option value="">Entire workspace</option>
            {scopeOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.title}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="shrink-0 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Ask
          </button>
        </form>

        {!hasAsked && recentQueries.length > 0 && (
          <div className="mt-10">
            <p className="nav-label mb-3">Recent questions</p>
            <ul className="space-y-1">
              {recentQueries.map(log => (
                <li key={log.id}>
                  <button
                    onClick={() => loadSaved({
                      query: log.query,
                      response: log.response ?? '',
                      sources: log.sources.map(s => ({
                        nodeId: s.node_id,
                        entityType: s.entity_type,
                        entityId: s.entity_id,
                        title: s.title,
                        excerpt: '',
                        projectName: null,
                        projectDatabaseId: null,
                        score: 0,
                      })),
                    })}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {log.query}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="mt-8 text-sm text-destructive">{error}</p>
        )}

        {!error && hasAsked && query && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-foreground mb-5">{query}</h2>

            {loading && sources.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                <SparkIcon className="text-spark animate-pulse shrink-0" />
                Searching knowledge graph…
              </div>
            )}

            {sources.length > 0 && (
              <div className="mb-6 -mx-1 flex gap-2 overflow-x-auto pb-1">
                {sources.map((s, i) => (
                  <Link
                    key={s.nodeId || s.entityId}
                    href={`/workspace/${workspaceId}/page/${s.entityId}`}
                    className="shrink-0 w-56 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/40 hover:bg-accent/40 transition-colors"
                  >
                    <span className="text-[11px] font-mono text-spark">{i + 1}</span>
                    <p className="text-[13px] font-medium text-foreground truncate mt-0.5">{s.title}</p>
                    {s.projectName && (
                      <p className="text-[11px] text-muted-foreground truncate">{s.projectName}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {response && (
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">{response}</p>
            )}

            {hasAsked && !loading && (
              <button
                onClick={reset}
                className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded"
              >
                Ask a new question
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
