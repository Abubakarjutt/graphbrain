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
    <div className="flex flex-col items-center justify-center min-h-full py-20 px-8">
      {/* Brand mark */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--gold)]/30 bg-[var(--gold)]/8 shadow-sm">
          <svg width="26" height="26" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M4 13.5 9 4l5 9.5" stroke="rgba(226,198,138,0.45)" strokeWidth="1" />
            <circle cx="9" cy="4" r="2" fill="#e2c68a" />
            <circle cx="4" cy="13.5" r="1.6" fill="#e2c68a" />
            <circle cx="14" cy="13.5" r="1.6" fill="#e2c68a" />
          </svg>
        </div>
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground mb-1">
            {workspace.name}
          </h1>
          <div className="gold-rule w-32 mx-auto mt-2" />
        </div>
      </div>

      <p className="text-muted-foreground text-sm mb-8 text-center max-w-xs leading-relaxed">
        Your knowledge graph is ready. Create a doc to start capturing ideas, or pick one from the sidebar.
      </p>

      <NewPageButton workspaceId={workspaceId} />
    </div>
  )
}
