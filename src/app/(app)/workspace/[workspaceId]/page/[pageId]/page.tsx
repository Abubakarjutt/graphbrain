import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadBlocks } from '@/lib/actions/pages'
import { getFileRecord, getSignedReadUrl } from '@/lib/actions/files'
import { PageEditor } from '@/components/editor/PageEditor'
import { PropertiesPanel } from '@/components/database/PropertiesPanel'
import { FilePage } from '@/components/files/FilePage'
import { DocProcessing } from '@/components/editor/DocProcessing'
import type { DatabaseField } from '@/lib/types/database'

export default async function PageViewPage({
  params,
}: {
  params: Promise<{ workspaceId: string; pageId: string }>
}) {
  const { workspaceId, pageId } = await params
  const supabase = await createClient()

  // Authorization is enforced by the pages_select RLS policy
  // (is_workspace_member); scope to the URL's workspace as well.
  const [{ data: page }, { data: workspace }, { data: dbRow }] = await Promise.all([
    supabase
      .from('pages')
      .select('id, title, workspace_id')
      .eq('id', pageId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single(),
    // A database doc import is a database row like any other row — this is
    // what distinguishes it below from a plain file attachment page.
    supabase
      .from('database_rows')
      .select('id, database_id, fields')
      .eq('page_id', pageId)
      .maybeSingle(),
  ])

  if (!page) notFound()

  // Check if this page is a file page (attachment) or a database doc import
  const fileRecord = await getFileRecord(pageId, workspaceId)
  if (fileRecord && dbRow) {
    if (fileRecord.extraction_status === 'pending' || fileRecord.extraction_status === 'error') {
      return (
        <div className="flex-1 overflow-auto">
          <DocProcessing fileRecord={fileRecord} workspaceId={workspaceId} />
        </div>
      )
    }
    // extraction_status === 'done' — blocks already exist from runDocParse, fall through to PageEditor below
  } else if (fileRecord) {
    const { url: signedUrl } = await getSignedReadUrl(pageId, workspaceId)
    return (
      <div className="flex-1 overflow-auto">
        <FilePage fileRecord={fileRecord} signedUrl={signedUrl} workspaceId={workspaceId} />
      </div>
    )
  }

  const doc = await loadBlocks(pageId, workspaceId)

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
          workspaceName={workspace?.name}
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
