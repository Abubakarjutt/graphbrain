import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadBlocks } from '@/lib/actions/pages'
import { PageEditor } from '@/components/editor/PageEditor'

export default async function PageViewPage({
  params,
}: {
  params: Promise<{ workspaceId: string; pageId: string }>
}) {
  const { workspaceId, pageId } = await params
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('pages')
    .select('id, title, workspace_id, workspace_members!inner(user_id)')
    .eq('id', pageId)
    .single()

  if (!page) notFound()

  const doc = await loadBlocks(pageId, workspaceId)

  return (
    <PageEditor
      pageId={pageId}
      workspaceId={workspaceId}
      initialTitle={page.title}
      initialDoc={doc}
    />
  )
}
