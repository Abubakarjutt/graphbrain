'use client'

import { useCallback, useState } from 'react'
import type { SearchResult } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

interface SavedAnswer {
  query: string
  response: string
  sources: SearchResult[]
}

export function useAsk(workspaceId: string) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<QueryScope>({})
  const [response, setResponse] = useState('')
  const [sources, setSources] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = useCallback(async (questionOverride?: string) => {
    const question = (questionOverride ?? query).trim()
    if (!question) return

    setQuery(question)
    setLoading(true)
    setResponse('')
    setSources([])
    setError(null)

    try {
      const res = await fetch('/api/query/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, query: question, scope }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        setError(body || 'AI unavailable — start Ollama with `ollama serve`')
        setLoading(false)
        return
      }

      const sourcesHeader = res.headers.get('X-Sources')
      if (sourcesHeader) setSources(JSON.parse(sourcesHeader) as SearchResult[])
      setLoading(false)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setResponse(prev => prev + decoder.decode(value))
      }
    } catch {
      setError('AI unavailable — start Ollama with `ollama serve`')
      setLoading(false)
    }
  }, [query, workspaceId, scope])

  const reset = useCallback(() => {
    setQuery('')
    setResponse('')
    setSources([])
    setError(null)
  }, [])

  // Instantly display a previously-logged answer without re-querying Ollama.
  const loadSaved = useCallback((saved: SavedAnswer) => {
    setQuery(saved.query)
    setResponse(saved.response)
    setSources(saved.sources)
    setError(null)
    setLoading(false)
  }, [])

  return { query, setQuery, scope, setScope, response, sources, loading, error, ask, reset, loadSaved }
}
