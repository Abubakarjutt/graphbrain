import { Suspense } from 'react'
import { notFound } from 'next/navigation'
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

  // Authorization is enforced by RLS, but every sibling route also checks
  // existence/membership explicitly so an unknown or foreign workspace id
  // 404s instead of rendering a fully-functional Ask UI with an empty scope.
  const [{ data: workspace }, { data: pages }] = await Promise.all([
    supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('id', workspaceId)
      .single(),
    supabase
      .from('pages')
      .select('id, title')
      .eq('workspace_id', workspaceId),
  ])
  if (!workspace) notFound()

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
