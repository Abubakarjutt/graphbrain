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
  const { query, setQuery, askedQuery, scope, setScope, response, sources, loading, error, ask, reset, loadSaved } = useAsk(workspaceId)
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  // Latched on the *value* of q, not a boolean — a boolean would ignore a
  // second Cmd+K "Ask AI about ..." deep-link fired while already on this
  // page, since React reuses the same component instance across a
  // searchParams-only navigation.
  const lastAutoAskedRef = useRef<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q && lastAutoAskedRef.current !== q) {
      lastAutoAskedRef.current = q
      ask(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Derived from askedQuery, not the live input — otherwise typing a single
  // character (before submitting anything) would prematurely hide "Recent
  // questions" and render the answer panel with the half-typed text.
  const hasAsked = loading || Boolean(response) || Boolean(error) || Boolean(askedQuery)

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
          className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors focus-within:border-spark/40 focus-within:shadow-[0_0_0_3px_oklch(0.46_0.10_152/10%)]"
          style={{ borderColor: 'var(--border)', boxShadow: '0 1px 4px oklch(0 0 0 / 5%)' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask anything about your knowledge graph…"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/40"
            aria-label="Ask a question"
          />
          <select
            value={scope.databaseId ?? ''}
            onChange={e => setScope(e.target.value ? { databaseId: e.target.value } : {})}
            className="text-[11px] bg-transparent rounded px-2 py-1 text-muted-foreground shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            style={{ border: '1px solid var(--border)' }}
            aria-label="Scope"
          >
            <option value="">All</option>
            {scopeOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.title}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="shrink-0 h-8 px-4 rounded-md text-[13px] font-semibold transition-all disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spark/60 active:scale-[0.98]"
            style={{ background: 'var(--spark)', color: 'var(--spark-foreground)', boxShadow: '0 2px 8px oklch(0.46 0.10 152 / 30%)' }}
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

        {!error && hasAsked && askedQuery && (
          <div className="mt-10">
            <h2 className="font-display text-[1.5rem] font-light tracking-tight text-foreground mb-5">{askedQuery}</h2>

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
                    className="shrink-0 w-52 rounded-lg px-3 py-2.5 transition-colors group"
                    style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'oklch(0.46 0.10 152 / 45%)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                  >
                    <span className="font-mono text-[10px] font-medium" style={{ color: 'var(--primary)', opacity: 0.7 }}>{i + 1}</span>
                    <p className="text-[12.5px] font-medium text-foreground truncate mt-0.5 leading-snug">{s.title}</p>
                    {s.projectName && (
                      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>{s.projectName}</p>
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
