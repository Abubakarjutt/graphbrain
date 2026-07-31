import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadBlocks } from '@/lib/actions/pages'
import { PageEditor } from '@/components/editor/PageEditor'
import { PropertiesPanel } from '@/components/database/PropertiesPanel'
import type { DatabaseField } from '@/lib/types/database'

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

  // Check if this page is a database row
  const { data: dbRow } = await supabase
    .from('database_rows')
    .select('id, database_id, fields')
    .eq('page_id', pageId)
    .single()

  let dbSchema: DatabaseField[] | null = null
  if (dbRow) {
    const { data: db } = await supabase
      .from('databases')
      .select('schema')
      .eq('id', dbRow.database_id)
      .single()
    dbSchema = (db?.schema as DatabaseField[]) ?? null
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <PageEditor
          pageId={pageId}
          workspaceId={workspaceId}
          initialTitle={page.title}
          initialDoc={doc}
        />
      </div>
      {dbRow && dbSchema && (
        <PropertiesPanel
          rowId={dbRow.id}
          databaseId={dbRow.database_id}
          workspaceId={workspaceId}
          schema={dbSchema}
          initialFields={dbRow.fields as Record<string, unknown>}
        />
      )}
    </div>
  )
}
