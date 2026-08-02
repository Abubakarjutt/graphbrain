import { describe, it, expect, vi, beforeEach } from 'vitest'
import { embed, checkHealth } from '@/lib/graph/ollama'

vi.mock('@/lib/graph/ollama', () => ({
  embed: vi.fn(),
  checkHealth: vi.fn(),
}))

describe('GET /api/debug', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(embed).mockReset()
    vi.mocked(checkHealth).mockReset()
  })

  async function callDebug() {
    const mod = await import('@/app/api/debug/route')
    const res = await mod.GET()
    return res.json()
  }

  it('reports ok for both checks when everything is healthy', async () => {
    vi.mocked(checkHealth).mockResolvedValue(true)
    vi.mocked(embed).mockResolvedValue(new Array(768).fill(0))

    const body = await callDebug()

    expect(body.ollama_health).toBe('ok')
    expect(body.embed).toBe('ok — 768-dim vector')
  })

  it('reports unreachable when Ollama health check returns false', async () => {
    vi.mocked(checkHealth).mockResolvedValue(false)
    vi.mocked(embed).mockResolvedValue([1, 2, 3])

    const body = await callDebug()

    expect(body.ollama_health).toBe('unreachable')
  })

  it('reports the error message when the health check throws', async () => {
    vi.mocked(checkHealth).mockRejectedValue(new Error('connection refused'))
    vi.mocked(embed).mockResolvedValue([1])

    const body = await callDebug()

    expect(body.ollama_health).toBe('error: connection refused')
  })

  it('reports the error message when embed throws, independently of health status', async () => {
    vi.mocked(checkHealth).mockResolvedValue(true)
    vi.mocked(embed).mockRejectedValue(new Error('model not found'))

    const body = await callDebug()

    expect(body.ollama_health).toBe('ok')
    expect(body.embed).toBe('error: model not found')
  })

  it('reports both failures independently when both checks fail', async () => {
    vi.mocked(checkHealth).mockRejectedValue(new Error('down'))
    vi.mocked(embed).mockRejectedValue(new Error('timeout'))

    const body = await callDebug()

    expect(body.ollama_health).toBe('error: down')
    expect(body.embed).toBe('error: timeout')
  })
})
