'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { searchQuery } from '@/lib/actions/query'
import { SearchResults } from './SearchResults'
import type { Database, Page, SearchResult } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

interface CmdKModalProps {
  databases: Database[]
  pages: Page[]
}

export function CmdKModal({ databases, pages }: CmdKModalProps) {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params?.workspaceId as string | undefined
  const currentDatabaseId = params?.databaseId as string | undefined

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<QueryScope>({})
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setError(null)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      if (currentDatabaseId) setScope({ databaseId: currentDatabaseId })
    }
  }, [open, currentDatabaseId])

  useEffect(() => {
    if (!query.trim() || !workspaceId) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      const res = await searchQuery(workspaceId, query, scope)
      if ('error' in res) {
        setError(res.error)
        setResults([])
      } else {
        setResults(res)
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, workspaceId, scope])

  function goAsk() {
    if (!workspaceId) return
    const q = query.trim()
    router.push(`/workspace/${workspaceId}/ask${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    close()
  }

  if (!workspaceId || !open) return null

  return (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24"
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-2xl bg-background rounded-xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-border gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground shrink-0" aria-hidden>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search pages and databases…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button onClick={close} className="text-xs text-muted-foreground hover:text-foreground px-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" aria-label="Close">Esc</button>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <button
            onClick={goAsk}
            className="flex items-center gap-1.5 px-3 py-1 -mx-1 rounded text-xs font-medium text-spark hover:bg-spark/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
              <path d="M5.5 1 6.7 4.3 10 5.5 6.7 6.7 5.5 10 4.3 6.7 1 5.5 4.3 4.3z" fill="currentColor" />
            </svg>
            {query.trim() ? `Ask AI about "${query.trim()}"` : 'Ask AI'}
          </button>
          <select
            value={scope.databaseId ?? ''}
            onChange={e => setScope(e.target.value ? { databaseId: e.target.value } : {})}
            className="text-xs bg-transparent border border-border rounded px-2 py-1 text-muted-foreground"
            aria-label="Scope"
          >
            <option value="">Entire workspace</option>
            {databases.map(db => {
              const title = pages.find(p => p.id === db.page_id)?.title || 'Untitled Database'
              return <option key={db.id} value={db.id}>{title}</option>
            })}
          </select>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && <p className="px-4 py-3 text-xs text-muted-foreground animate-pulse">Searching…</p>}
          {!loading && query && results.length === 0 && !error && (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">No results yet — content is still being indexed</p>
          )}
          {error && <p className="px-4 py-3 text-sm text-destructive">{error}</p>}
          <SearchResults results={results} workspaceId={workspaceId} onNavigate={close} />
        </div>
      </div>
    </div>
  )
}
