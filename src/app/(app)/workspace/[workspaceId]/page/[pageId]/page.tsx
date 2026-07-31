import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadBlocks } from '@/lib/actions/pages'
import { getFileRecord, getSignedReadUrl } from '@/lib/actions/files'
import { PageEditor } from '@/components/editor/PageEditor'
import { PropertiesPanel } from '@/components/database/PropertiesPanel'
import { FilePage } from '@/components/files/FilePage'
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

  // Check if this page is a file page
  const fileRecord = await getFileRecord(pageId, workspaceId)
  if (fileRecord) {
    const { url: signedUrl } = await getSignedReadUrl(fileRecord.storage_path, workspaceId)
    return (
      <div className="flex-1 overflow-auto">
        <FilePage fileRecord={fileRecord} signedUrl={signedUrl} workspaceId={workspaceId} />
      </div>
    )
  }

  const doc = await loadBlocks(pageId, workspaceId)

  // Check if this page is a database row
  const { data: dbRow } = await supabase
    .from('database_rows')
    .select('id, database_id, fields')
    .eq('page_id', pageId)
    .maybeSingle()

  let dbSchema: DatabaseField[] | null = null
  if (dbRow) {
    const { data: db } = await supabase
      .from('databases')
      .select('schema')
      .eq('id', dbRow.database_id)
      .single()
    dbSchema = (db?.schema as DatabaseField[]) ?? null
  }

  // Fetch child file pages for the attachment list
  const { data: childPages } = await supabase
    .from('pages')
    .select('id, title')
    .eq('parent_id', pageId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  const childPageIds = (childPages ?? []).map(p => p.id)
  let fileAttachments: Array<{ pageId: string; filename: string }> = []
  if (childPageIds.length > 0) {
    const { data: fileRecords } = await supabase
      .from('files')
      .select('page_id')
      .in('page_id', childPageIds)
    const filePageIdSet = new Set((fileRecords ?? []).map(f => f.page_id))
    fileAttachments = (childPages ?? [])
      .filter(p => filePageIdSet.has(p.id))
      .map(p => ({ pageId: p.id, filename: p.title }))
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <PageEditor
          pageId={pageId}
          workspaceId={workspaceId}
          initialTitle={page.title}
          initialDoc={doc}
          fileAttachments={fileAttachments}
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
