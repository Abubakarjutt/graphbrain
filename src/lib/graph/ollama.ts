const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434'

export async function embed(text: string): Promise<number[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`)
    const json = await res.json() as { embedding: number[] }
    return json.embedding
  } finally {
    clearTimeout(timeout)
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`${OLLAMA_BASE}/`, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}
