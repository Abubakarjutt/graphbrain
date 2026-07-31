import { createClient } from '@/lib/supabase/server'
import { retrieveNodes } from '@/lib/graph/query'
import { streamChat } from '@/lib/graph/ollama'
import type { SearchResult } from '@/lib/types/database'
import type { QueryScope } from '@/lib/graph/query'

function buildPrompt(query: string, sources: SearchResult[]): string {
  const context = sources
    .map(s => {
      const project = s.projectName ? ` [Project: ${s.projectName}]` : ''
      return `### ${s.title}${project}\n${s.excerpt}`
    })
    .join('\n\n')
  return [
    'You are a knowledge assistant. Answer using ONLY the context below.',
    'Cite sources by their title. If the answer is not in the context, say so clearly.',
    '',
    'Context:',
    context,
    '',
    `Question: ${query}`,
  ].join('\n')
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json() as { workspaceId: string; query: string; scope?: QueryScope }
  const { workspaceId, query, scope } = body

  let sources: SearchResult[] = []
  let prompt: string
  try {
    sources = await retrieveNodes(workspaceId, query, scope)
    prompt = buildPrompt(query, sources)
  } catch {
    return new Response('AI unavailable — start Ollama with `ollama serve`', { status: 503 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = ''
      try {
        for await (const token of streamChat(prompt)) {
          controller.enqueue(new TextEncoder().encode(token))
          fullResponse += token
        }
      } catch {
        controller.enqueue(new TextEncoder().encode('\n\n[Response cut short — Ollama timed out]'))
      }
      try {
        await supabase.from('query_logs').insert({
          workspace_id: workspaceId,
          user_id: user.id,
          query,
          response: fullResponse,
          sources: sources.map(s => ({
            node_id: s.nodeId,
            entity_type: s.entityType,
            entity_id: s.entityId,
            title: s.title,
          })),
        })
      } catch (err) {
        console.error('query_logs insert failed:', err)
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Sources': JSON.stringify(sources),
    },
  })
}
