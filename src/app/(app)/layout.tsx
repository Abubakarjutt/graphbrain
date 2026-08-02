import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { checkHealth } from '@/lib/graph/ollama'
import type { WorkspaceEntry, Page, Database, DatabaseRowLink } from '@/lib/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id) as { data: WorkspaceEntry[] | null }

  const workspaceIds = (workspaces ?? []).map(w => w.workspace_id)
  const pages: Page[] = workspaceIds.length > 0
    ? (await supabase
        .from('pages')
        .select('*')
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: true })
      ).data ?? []
    : []

  const pageIds = pages.map(p => p.id)
  const databases: Database[] = pageIds.length > 0
    ? (await supabase
        .from('databases')
        .select('id, page_id, schema, created_at')
        .in('page_id', pageIds)
      ).data ?? []
    : []

  const databaseIds = databases.map(d => d.id)
  const databaseRows: DatabaseRowLink[] = databaseIds.length > 0
    ? (await supabase
        .from('database_rows')
        .select('id, database_id, page_id')
        .in('database_id', databaseIds)
      ).data ?? []
    : []

  const ollamaAvailable = await checkHealth()

  return (
    <AppShell
      workspaces={workspaces ?? []}
      user={user}
      pages={pages}
      databases={databases}
      databaseRows={databaseRows}
      ollamaAvailable={ollamaAvailable}
    >
      {children}
    </AppShell>
  )
}
