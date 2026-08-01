import { embed, checkHealth } from '@/lib/graph/ollama'

export async function GET(): Promise<Response> {
  const steps: Record<string, string> = {}

  // 1. Ollama reachable?
  try {
    const healthy = await checkHealth()
    steps.ollama_health = healthy ? 'ok' : 'unreachable'
  } catch (e) {
    steps.ollama_health = `error: ${e instanceof Error ? e.message : String(e)}`
  }

  // 2. nomic-embed-text working?
  try {
    const vec = await embed('test query for graphbrain debug')
    steps.embed = `ok — ${vec.length}-dim vector`
  } catch (e) {
    steps.embed = `error: ${e instanceof Error ? e.message : String(e)}`
  }

  return Response.json(steps)
}
