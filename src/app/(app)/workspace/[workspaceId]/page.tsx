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
    <div className="flex flex-col min-h-full">
      {/* Thin header */}
      <div className="h-11 flex items-center px-5 border-b border-border/40 shrink-0">
        <span className="text-sm font-medium text-muted-foreground/70">{workspace.name}</span>
      </div>

      {/* Empty state — centered */}
      <div className="flex flex-col items-center justify-center flex-1 py-20 px-8">
        {/* Workspace icon */}
        <div className="mb-6 text-5xl leading-none select-none" aria-hidden>
          🧠
        </div>

        {/* Title */}
        <h1 className="text-[2rem] font-bold tracking-tight text-foreground mb-2 text-center">
          {workspace.name}
        </h1>

        {/* Subtitle */}
        <p className="text-muted-foreground/70 text-sm mb-8 text-center max-w-sm leading-relaxed">
          Get started by creating a page, or pick one from the sidebar.
        </p>

        {/* CTA */}
        <NewPageButton workspaceId={workspaceId} />

        {/* Hint */}
        <p className="mt-6 text-xs text-muted-foreground/40">
          Press <kbd className="font-mono bg-muted/60 border border-border/40 rounded px-1 py-0.5">⌘K</kbd> to search
        </p>
      </div>
    </div>
  )
}
