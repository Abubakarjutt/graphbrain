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
        {/* Workspace mark — the same three-node graph used as the brand mark */}
        <span className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-accent border border-border" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="4.5" r="2.2" fill="var(--accent-foreground)" />
            <circle cx="4" cy="13.5" r="1.8" fill="var(--accent-foreground)" opacity="0.7" />
            <circle cx="14" cy="13.5" r="1.8" fill="var(--accent-foreground)" opacity="0.7" />
            <path d="M9 6.5 4.8 11.8M9 6.5l4.2 5.3M4.8 13.5h8.4" stroke="var(--accent-foreground)" strokeWidth="1" opacity="0.4" />
          </svg>
        </span>

        {/* Title */}
        <h1 className="text-[2rem] font-bold tracking-tight text-foreground mb-2 text-center">
          {workspace.name}
        </h1>

        {/* Subtitle */}
        <p className="text-muted-foreground/70 text-sm mb-8 text-center max-w-sm leading-relaxed">
          Nothing here yet — start a page and it&apos;ll show up in the sidebar, linked to whatever you write next.
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
