import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { NewPageButton } from '@/components/editor/NewPageButton'

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createClient()

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, workspace_members!inner(user_id)')
    .eq('id', workspaceId)
    .single()

  if (!workspace) notFound()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">{workspace.name}</h1>
      <p className="text-muted-foreground mt-2 mb-6">
        Select a page from the sidebar, or create a new one.
      </p>
      <NewPageButton workspaceId={workspaceId} />
    </div>
  )
}
