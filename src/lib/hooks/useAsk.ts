'use client'

import { useCallback, useRef, useState } from 'react'
import type { SearchResult } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

interface SavedAnswer {
  query: string
  response: string
  sources: SearchResult[]
}

export function useAsk(workspaceId: string) {
  const [query, setQuery] = useState('')
  // Set only when a request actually starts — unlike `query`, this never
  // reflects an unsubmitted, mid-typing input value.
  const [askedQuery, setAskedQuery] = useState('')
  const [scope, setScope] = useState<QueryScope>({})
  const [response, setResponse] = useState('')
  const [sources, setSources] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const ask = useCallback(async (questionOverride?: string) => {
    const question = (questionOverride ?? query).trim()
    if (!question) return

    // Cancel any still-in-flight ask so its late-arriving chunks can't
    // interleave into this one's response.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setQuery(question)
    setAskedQuery(question)
    setLoading(true)
    setResponse('')
    setSources([])
    setError(null)

    let receivedAnyContent = false

    try {
      const res = await fetch('/api/query/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, query: question, scope }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        setError(body || 'AI unavailable — start Ollama with `ollama serve`')
        return
      }

      const sourcesHeader = res.headers.get('X-Sources')
      if (sourcesHeader) {
        try {
          setSources(JSON.parse(sourcesHeader) as SearchResult[])
        } catch (err) {
          // A malformed header shouldn't block a perfectly good answer.
          console.error('[useAsk] failed to parse X-Sources header:', err)
        }
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setError('AI unavailable — no response stream received')
        return
      }

      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          receivedAnyContent = true
          setResponse(prev => prev + decoder.decode(value))
        }
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('[useAsk] stream reading failed:', err)
        // A real, correct partial answer may already be visible — don't
        // clobber it with an error message, just stop streaming.
        if (!receivedAnyContent) {
          setError('AI unavailable — the connection was interrupted before any response arrived')
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return
      console.error('[useAsk] request failed:', err)
      setError('AI unavailable — start Ollama with `ollama serve`')
    } finally {
      // Only clear loading if a newer ask() hasn't already taken over.
      if (abortRef.current === controller) setLoading(false)
    }
  }, [query, workspaceId, scope])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setQuery('')
    setAskedQuery('')
    setResponse('')
    setSources([])
    setError(null)
    setLoading(false)
  }, [])

  // Instantly display a previously-logged answer without re-querying Ollama.
  const loadSaved = useCallback((saved: SavedAnswer) => {
    abortRef.current?.abort()
    setQuery(saved.query)
    setAskedQuery(saved.query)
    setResponse(saved.response)
    setSources(saved.sources)
    setError(null)
    setLoading(false)
  }, [])

  return { query, setQuery, askedQuery, scope, setScope, response, sources, loading, error, ask, reset, loadSaved }
}
