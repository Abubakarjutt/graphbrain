import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ollama client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  describe('checkHealth', () => {
    it('returns true when Ollama responds with 200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
      const { checkHealth } = await import('@/lib/graph/ollama')
      expect(await checkHealth()).toBe(true)
    })

    it('returns false when Ollama returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
      const { checkHealth } = await import('@/lib/graph/ollama')
      expect(await checkHealth()).toBe(false)
    })

    it('returns false when fetch throws (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
      const { checkHealth } = await import('@/lib/graph/ollama')
      expect(await checkHealth()).toBe(false)
    })
  })

  describe('embed', () => {
    it('POSTs to /api/embeddings and returns the embedding array', async () => {
      const embedding = Array(768).fill(0.1)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ embedding }),
      }))
      const { embed } = await import('@/lib/graph/ollama')
      const result = await embed('hello world')
      expect(result).toEqual(embedding)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/embeddings'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('throws when Ollama returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
      const { embed } = await import('@/lib/graph/ollama')
      await expect(embed('test')).rejects.toThrow('Ollama embed failed: 500')
    })
  })
})
