import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAsk } from '@/lib/hooks/useAsk'
import type { SearchResult } from '@/lib/types/database'

function fakeSource(overrides: Partial<SearchResult> & Pick<SearchResult, 'entityId' | 'title'>): SearchResult {
  return {
    nodeId: `node-${overrides.entityId}`,
    entityType: 'page',
    excerpt: '',
    projectName: null,
    projectDatabaseId: null,
    score: 1,
    ...overrides,
  }
}

function mockStreamResponse(options: {
  chunks?: string[]
  sourcesHeader?: SearchResult[]
  ok?: boolean
  status?: number
  bodyText?: string
}) {
  const chunks = options.chunks ?? []
  let i = 0
  const encoder = new TextEncoder()
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get: (name: string) => (name === 'X-Sources' && options.sourcesHeader ? JSON.stringify(options.sourcesHeader) : null),
    },
    text: async () => options.bodyText ?? '',
    body: {
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) {
            const value = encoder.encode(chunks[i])
            i += 1
            return { done: false, value }
          }
          return { done: true, value: undefined }
        },
      }),
    },
  } as unknown as Response
}

describe('useAsk', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('starts with empty state', () => {
    const { result } = renderHook(() => useAsk('ws-1'))
    expect(result.current.query).toBe('')
    expect(result.current.response).toBe('')
    expect(result.current.sources).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('does nothing when asked an empty or whitespace-only question', async () => {
    const { result } = renderHook(() => useAsk('ws-1'))
    await act(async () => { await result.current.ask('   ') })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts to /api/query/ask with the workspace, query, and scope', async () => {
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ chunks: ['Hello'] }))
    const { result } = renderHook(() => useAsk('ws-1'))

    act(() => { result.current.setScope({ databaseId: 'db-1' }) })
    await act(async () => { await result.current.ask('What is graphbrain?') })

    expect(fetch).toHaveBeenCalledWith('/api/query/ask', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'ws-1', query: 'What is graphbrain?', scope: { databaseId: 'db-1' } }),
    }))
  })

  it('sets the query state from the asked question', async () => {
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ chunks: [] }))
    const { result } = renderHook(() => useAsk('ws-1'))

    await act(async () => { await result.current.ask('trimmed question  '.trim()) })

    expect(result.current.query).toBe('trimmed question')
  })

  it('accumulates streamed response tokens in order', async () => {
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ chunks: ['Hel', 'lo ', 'world'] }))
    const { result } = renderHook(() => useAsk('ws-1'))

    await act(async () => { await result.current.ask('question') })

    expect(result.current.response).toBe('Hello world')
    expect(result.current.loading).toBe(false)
  })

  it('populates sources from the X-Sources header', async () => {
    const sources = [fakeSource({ entityId: 'e1', title: 'Doc One' })]
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ chunks: ['answer'], sourcesHeader: sources }))
    const { result } = renderHook(() => useAsk('ws-1'))

    await act(async () => { await result.current.ask('question') })

    expect(result.current.sources).toEqual(sources)
  })

  it('sets an error from the response body when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ ok: false, status: 503, bodyText: 'AI unavailable: timeout' }))
    const { result } = renderHook(() => useAsk('ws-1'))

    await act(async () => { await result.current.ask('question') })

    expect(result.current.error).toBe('AI unavailable: timeout')
    expect(result.current.loading).toBe(false)
  })

  it('falls back to a generic error message when fetch itself throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useAsk('ws-1'))

    await act(async () => { await result.current.ask('question') })

    expect(result.current.error).toMatch(/AI unavailable/)
    expect(result.current.loading).toBe(false)
  })

  it('clears a previous error, response, and sources when a new ask begins', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockStreamResponse({ ok: false, bodyText: 'boom' }))
    const { result } = renderHook(() => useAsk('ws-1'))
    await act(async () => { await result.current.ask('first') })
    expect(result.current.error).toBe('boom')

    vi.mocked(fetch).mockResolvedValueOnce(mockStreamResponse({ chunks: ['ok'] }))
    await act(async () => { await result.current.ask('second') })

    expect(result.current.error).toBeNull()
    expect(result.current.response).toBe('ok')
  })

  it('resets all state back to initial', async () => {
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ chunks: ['answer'] }))
    const { result } = renderHook(() => useAsk('ws-1'))
    await act(async () => { await result.current.ask('question') })

    act(() => { result.current.reset() })

    expect(result.current.query).toBe('')
    expect(result.current.response).toBe('')
    expect(result.current.sources).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('loads a saved answer instantly without making a request', () => {
    const { result } = renderHook(() => useAsk('ws-1'))
    const saved = {
      query: 'past question',
      response: 'past answer',
      sources: [fakeSource({ entityId: 'e1', title: 'Doc One' })],
    }

    act(() => { result.current.loadSaved(saved) })

    expect(result.current.query).toBe('past question')
    expect(result.current.response).toBe('past answer')
    expect(result.current.sources).toEqual(saved.sources)
    expect(result.current.loading).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sets askedQuery to the submitted question, separate from the live query', async () => {
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ chunks: [] }))
    const { result } = renderHook(() => useAsk('ws-1'))

    await act(async () => { await result.current.ask('a real question') })

    expect(result.current.askedQuery).toBe('a real question')
  })

  it('clears askedQuery on reset', async () => {
    vi.mocked(fetch).mockResolvedValue(mockStreamResponse({ chunks: [] }))
    const { result } = renderHook(() => useAsk('ws-1'))
    await act(async () => { await result.current.ask('a question') })

    act(() => { result.current.reset() })

    expect(result.current.askedQuery).toBe('')
  })

  it('aborts a still-in-flight request when a new ask starts before it finishes', async () => {
    let capturedFirstSignal: AbortSignal | undefined
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      capturedFirstSignal = (init as RequestInit).signal as AbortSignal
      return new Promise(() => {}) // never resolves — simulates a slow in-flight request
    })
    const { result } = renderHook(() => useAsk('ws-1'))

    act(() => { void result.current.ask('first question') })

    vi.mocked(fetch).mockResolvedValueOnce(mockStreamResponse({ chunks: ['second answer'] }))
    await act(async () => { await result.current.ask('second question') })

    expect(capturedFirstSignal?.aborted).toBe(true)
    expect(result.current.query).toBe('second question')
    expect(result.current.response).toBe('second answer')
  })

  it('aborts an in-flight request when reset is called', async () => {
    let capturedSignal: AbortSignal | undefined
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      capturedSignal = (init as RequestInit).signal as AbortSignal
      return new Promise(() => {})
    })
    const { result } = renderHook(() => useAsk('ws-1'))
    act(() => { void result.current.ask('question') })

    act(() => { result.current.reset() })

    expect(capturedSignal?.aborted).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('does not fail the whole request when the X-Sources header is malformed JSON', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name === 'X-Sources' ? 'not-valid-json{' : null) },
      text: async () => '',
      body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
    } as unknown as Response)

    const { result } = renderHook(() => useAsk('ws-1'))
    await act(async () => { await result.current.ask('question') })

    expect(result.current.error).toBeNull()
    expect(result.current.sources).toEqual([])
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('preserves a partial response and shows no error when the stream fails after some content arrived', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let readCount = 0
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '',
      body: {
        getReader: () => ({
          read: async () => {
            readCount += 1
            if (readCount === 1) return { done: false, value: new TextEncoder().encode('partial answer') }
            throw new Error('connection dropped')
          },
        }),
      },
    } as unknown as Response)

    const { result } = renderHook(() => useAsk('ws-1'))
    await act(async () => { await result.current.ask('question') })

    expect(result.current.response).toBe('partial answer')
    expect(result.current.error).toBeNull()
    consoleErrorSpy.mockRestore()
  })

  it('sets an error when the stream fails before any content arrives', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '',
      body: { getReader: () => ({ read: async () => { throw new Error('dropped immediately') } }) },
    } as unknown as Response)

    const { result } = renderHook(() => useAsk('ws-1'))
    await act(async () => { await result.current.ask('question') })

    expect(result.current.response).toBe('')
    expect(result.current.error).toMatch(/interrupted/)
    consoleErrorSpy.mockRestore()
  })
})
