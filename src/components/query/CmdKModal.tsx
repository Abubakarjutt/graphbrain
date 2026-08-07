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
  open?: boolean
  onClose?: () => void
}

export function CmdKModal({ databases, pages, open: controlledOpen, onClose }: CmdKModalProps) {
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

  const isOpen = controlledOpen ?? open

  const close = useCallback(() => {
    setOpen(false)
    onClose?.()
    setQuery('')
    setResults([])
    setError(null)
  }, [onClose])

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
    if (isOpen) {
      inputRef.current?.focus()
      if (currentDatabaseId) setScope({ databaseId: currentDatabaseId })
    }
  }, [isOpen, currentDatabaseId])

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

  if (!workspaceId || !isOpen) return null

  return (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      style={{ background: 'oklch(0 0 0 / 55%)' }}
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-[580px] mx-4 animate-fade-in overflow-hidden rounded-xl"
        style={{
          background: 'var(--popover)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px -12px oklch(0 0 0 / 0.35), 0 4px 16px -4px oklch(0 0 0 / 0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: '1px solid var(--border)' }}>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ color: 'var(--muted-foreground)', opacity: 0.5, flexShrink: 0 }}
            aria-hidden
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11.5 11.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--muted-foreground)] placeholder:opacity-40"
            style={{ color: 'var(--foreground)' }}
            placeholder="Search pages and databases…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {loading && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--muted-foreground)', opacity: 0.4, flexShrink: 0, animation: 'spin 1s linear infinite' }} aria-label="Searching">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="10" />
            </svg>
          )}
          <button
            onClick={close}
            className="shrink-0 h-6 px-2 rounded text-[11px] font-mono transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            style={{
              color: 'var(--muted-foreground)',
              background: 'var(--muted)',
              border: '1px solid var(--border)',
            }}
            aria-label="Close"
          >
            Esc
          </button>
        </div>

        {/* Ask AI + scope row */}
        <div className="flex items-center justify-between px-4 h-10" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={goAsk}
            className="flex items-center gap-2 h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            style={{ color: 'var(--spark)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'oklch(0.62 0.16 58 / 12%)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden>
              <path d="M5.5 1 6.7 4.3 10 5.5 6.7 6.7 5.5 10 4.3 6.7 1 5.5 4.3 4.3z" />
            </svg>
            {query.trim() ? `Ask AI about "${query.trim()}"` : 'Ask AI'}
          </button>
          <select
            value={scope.databaseId ?? ''}
            onChange={e => setScope(e.target.value ? { databaseId: e.target.value } : {})}
            className="text-[11px] bg-transparent rounded px-2 py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
            aria-label="Scope"
          >
            <option value="">All</option>
            {databases.map(db => {
              const title = pages.find(p => p.id === db.page_id)?.title || 'Untitled Database'
              return <option key={db.id} value={db.id}>{title}</option>
            })}
          </select>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto sidebar-scroll">
          {!loading && !query && (
            <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <p className="text-[13px]">Type to search</p>
            </div>
          )}
          {!loading && query && results.length === 0 && !error && (
            <p className="px-4 py-8 text-[13px] text-center" style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>
              No results — content may still be indexing
            </p>
          )}
          {error && (
            <p className="px-4 py-3 text-sm text-destructive">{error}</p>
          )}
          <SearchResults results={results} workspaceId={workspaceId} onNavigate={close} />
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
