'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FileRecord } from '@/lib/types/database'

function extractionStatusForMimeType(mimeType: string): 'pending' | 'none' {
  const extractable = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
  ]
  return extractable.includes(mimeType) ? 'pending' : 'none'
}

async function runExtraction(fileId: string, storagePath: string, mimeType: string): Promise<void> {
  const supabase = await createClient()
  try {
    const { data: blob, error } = await supabase.storage.from('files').download(storagePath)
    if (error || !blob) throw new Error(error?.message ?? 'Download failed')

    const buffer = Buffer.from(await blob.arrayBuffer())
    let text: string | null = null

    if (mimeType === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(buffer)
      text = result.text
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      text = buffer.toString('utf-8')
    }

    await supabase
      .from('files')
      .update({ extracted_text: text, extraction_status: 'done' })
      .eq('id', fileId)
  } catch {
    await supabase
      .from('files')
      .update({ extraction_status: 'error' })
      .eq('id', fileId)
  }
}

export async function getUploadUrl(
  filename: string,
  mimeType: string,
  workspaceId: string
): Promise<{ signedUrl: string; storagePath: string; reservedPageId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) throw new Error('Access denied')

  const reservedPageId = crypto.randomUUID()
  const storagePath = `${workspaceId}/${reservedPageId}/${filename}`

  const { data, error } = await supabase.storage.from('files').createSignedUploadUrl(storagePath)
  if (error || !data) throw new Error(error?.message ?? 'Failed to create upload URL')

  return { signedUrl: data.signedUrl, storagePath, reservedPageId }
}

export async function createFilePage(
  workspaceId: string,
  parentPageId: string,
  filename: string,
  storagePath: string,
  mimeType: string,
  reservedPageId: string
): Promise<{ pageId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { error: pageError } = await supabase.from('pages').insert({
    id: reservedPageId,
    workspace_id: workspaceId,
    parent_id: parentPageId,
    title: filename,
    created_by: user.id,
  })
  if (pageError) throw new Error(pageError.message)

  const extractionStatus = extractionStatusForMimeType(mimeType)

  const { data: fileData, error: fileError } = await supabase
    .from('files')
    .insert({
      workspace_id: workspaceId,
      page_id: reservedPageId,
      storage_path: storagePath,
      mime_type: mimeType,
      extraction_status: extractionStatus,
    })
    .select('id')
    .single()

  if (fileError || !fileData) {
    await supabase.from('pages').delete().eq('id', reservedPageId)
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(fileError?.message ?? 'Failed to create file record')
  }

  if (extractionStatus === 'pending') {
    after(() => runExtraction(fileData.id, storagePath, mimeType))
  }

  revalidatePath(`/workspace/${workspaceId}/page/${parentPageId}`)
  return { pageId: reservedPageId }
}

export async function getFileRecord(pageId: string, workspaceId: string): Promise<FileRecord | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('files')
    .select('id, workspace_id, page_id, storage_path, mime_type, extracted_text, extraction_status, created_at')
    .eq('page_id', pageId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  return data as FileRecord | null
}

export async function getSignedReadUrl(storagePath: string, workspaceId: string): Promise<{ url: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) throw new Error('Access denied')

  const { data, error } = await supabase.storage.from('files').createSignedUrl(storagePath, 3600)
  if (error || !data) throw new Error(error?.message ?? 'Failed to create read URL')

  return { url: data.signedUrl }
}

export async function retryExtraction(fileId: string, workspaceId: string): Promise<FileRecord> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: file } = await supabase
    .from('files')
    .select('id, workspace_id, page_id, storage_path, mime_type, extracted_text, extraction_status, created_at')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!file) throw new Error('File not found or access denied')

  await runExtraction(fileId, (file as FileRecord).storage_path, (file as FileRecord).mime_type)

  const { data: updated } = await supabase
    .from('files')
    .select('id, workspace_id, page_id, storage_path, mime_type, extracted_text, extraction_status, created_at')
    .eq('id', fileId)
    .single()

  return updated as FileRecord
}
