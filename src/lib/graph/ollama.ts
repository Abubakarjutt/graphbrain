// IMPORTANT: nomic-embed-text produces 768-dimensional vectors.
// The match_nodes SQL function and nodes.embedding column are both vector(768).
// If you change the embedding model, update the SQL schema and function too.
const EMBED_MODEL = 'nomic-embed-text'

function validateOllamaBase(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch {
    throw new Error(`OLLAMA_URL is not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`OLLAMA_URL must use http or https, got: ${url.protocol}`)
  }
  return raw.replace(/\/$/, '')
}

const OLLAMA_BASE = validateOllamaBase(process.env.OLLAMA_URL ?? 'http://localhost:11434')

export async function embed(text: string): Promise<number[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
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

export async function* streamChat(prompt: string, timeoutMs = 120_000): AsyncGenerator<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.1:8b', prompt, stream: true }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`)
    if (!res.body) throw new Error('Ollama response body is null')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      if (controller.signal.aborted) throw new Error('Ollama stream timed out')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines.filter(Boolean)) {
        try {
          const json = JSON.parse(line) as { response: string; done: boolean }
          if (!json.done) yield json.response
        } catch {
          // malformed NDJSON line — skip
        }
      }
    }
    // flush any remaining buffer content
    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer) as { response: string; done: boolean }
        if (!json.done) yield json.response
      } catch { /* ignore */ }
    }
  } finally {
    clearTimeout(timeout)
  }
}
