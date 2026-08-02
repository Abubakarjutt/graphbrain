import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDatabase } from '@/lib/actions/databases'
import { getTodoBoard } from '@/lib/actions/todos'
import { getPages } from '@/lib/actions/pages'
import { DatabaseShell } from '@/components/database/DatabaseShell'

export default async function DatabasePage({
  params,
}: {
  params: Promise<{ workspaceId: string; databaseId: string }>
}) {
  const { workspaceId, databaseId } = await params
  const supabase = await createClient()

  let db
  try {
    db = await getDatabase(databaseId, workspaceId)
  } catch {
    notFound()
  }

  const { data: containerPage } = await supabase
    .from('pages')
    .select('title')
    .eq('id', db.page_id)
    .single()

  const [todoBoard, pages] = await Promise.all([
    getTodoBoard(databaseId, workspaceId),
    getPages(workspaceId),
  ])

  return (
    <DatabaseShell
      databaseId={databaseId}
      workspaceId={workspaceId}
      title={containerPage?.title ?? 'Untitled Database'}
      schema={db.schema}
      rows={db.rows}
      todoBoard={todoBoard}
      pages={pages}
    />
  )
}
