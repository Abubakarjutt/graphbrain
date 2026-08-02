import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getRecentQueries } from '@/lib/actions/query'
import { AskPageClient } from '@/components/query/AskPageClient'

export default async function AskPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createClient()

  const { data: pages } = await supabase
    .from('pages')
    .select('id, title')
    .eq('workspace_id', workspaceId)
  const pageMap = new Map((pages ?? []).map(p => [p.id as string, p.title as string]))
  const pageIds = [...pageMap.keys()]

  const { data: databases } = pageIds.length > 0
    ? await supabase.from('databases').select('id, page_id').in('page_id', pageIds)
    : { data: [] as { id: string; page_id: string }[] }

  const scopeOptions = (databases ?? []).map(db => ({
    id: db.id as string,
    title: pageMap.get(db.page_id as string) || 'Untitled Database',
  }))

  const recentQueries = await getRecentQueries(workspaceId)

  return (
    <Suspense fallback={null}>
      <AskPageClient
        workspaceId={workspaceId}
        scopeOptions={scopeOptions}
        recentQueries={recentQueries}
      />
    </Suspense>
  )
}
