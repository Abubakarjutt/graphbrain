import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function WorkspacePage({
  params,
}: {
  params: { workspaceId: string }
}) {
  const supabase = await createClient()

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', params.workspaceId)
    .single()

  if (!workspace) notFound()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">{workspace.name}</h1>
      <p className="text-muted-foreground mt-2">
        Select a page from the sidebar, or create a new one.
      </p>
    </div>
  )
}
