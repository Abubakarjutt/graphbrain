'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { upsertNode, scheduleEmbed } from '@/lib/graph/graph'
import { fileToText } from '@/lib/graph/content'
import type { FileRecord } from '@/lib/types/database'

const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
])

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

async function runExtraction(fileId: string, storagePath: string, mimeType: string, workspaceId: string): Promise<void> {
  const supabase = await createClient()
  let extractedText: string | null = null

  try {
    const { data: blob, error } = await supabase.storage.from('files').download(storagePath)
    if (error || !blob) throw new Error(error?.message ?? 'Download failed')

    const buffer = Buffer.from(await blob.arrayBuffer())

    if (mimeType === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      extractedText = result.text
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      extractedText = result.value
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      extractedText = buffer.toString('utf-8')
    }

    await supabase
      .from('files')
      .update({ extracted_text: extractedText, extraction_status: 'done' })
      .eq('id', fileId)
  } catch {
    await supabase
      .from('files')
      .update({ extraction_status: 'error' })
      .eq('id', fileId)
    return
  }

  // Graph writes are independent — extraction already succeeded, never touch extraction_status here
  try {
    const embeddableText = fileToText(extractedText)
    if (embeddableText) {
      const nodeId = await upsertNode(workspaceId, 'file', fileId)
      await scheduleEmbed(nodeId, embeddableText)
    }
  } catch (err) {
    console.error(`runExtraction: graph write failed for file ${fileId}:`, err)
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
  // Sanitize filename: strip path separators and traversal sequences
  const safeName = filename.replace(/^.*[\\/]/, '').replace(/\.{2,}/g, '.').slice(0, 200) || 'file'
  const storagePath = `${workspaceId}/${reservedPageId}/${safeName}`

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

  // Defense-in-depth: verify workspace membership (consistent with other mutating actions)
  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) throw new Error('Access denied')

  // Validate the storage path belongs to this workspace/page to prevent path injection
  const expectedPrefix = `${workspaceId}/${reservedPageId}/`
  if (!storagePath.startsWith(expectedPrefix)) throw new Error('Invalid storage path')

  const { error: pageError } = await supabase.from('pages').insert({
    id: reservedPageId,
    workspace_id: workspaceId,
    parent_id: parentPageId,
    title: filename,
    created_by: user.id,
  })
  if (pageError) {
    // Clean up the already-uploaded storage object before failing
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(pageError.message)
  }

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
    after(() => runExtraction(fileData.id, storagePath, mimeType, workspaceId))
  }

  revalidatePath(`/workspace/${workspaceId}/page/${parentPageId}`)
  return { pageId: reservedPageId }
}

export async function getFileRecord(pageId: string, workspaceId: string): Promise<FileRecord | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Defense-in-depth: verify workspace membership before returning extracted_text
  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return null

  const { data } = await supabase
    .from('files')
    .select('id, workspace_id, page_id, storage_path, mime_type, extracted_text, extraction_status, created_at')
    .eq('page_id', pageId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  return data as FileRecord | null
}

// Accepts pageId instead of storagePath to prevent callers from minting signed URLs for arbitrary paths
export async function getSignedReadUrl(pageId: string, workspaceId: string): Promise<{ url: string }> {
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

  // Look up storage path from DB — never trust client-supplied paths for reads
  const { data: file } = await supabase
    .from('files')
    .select('storage_path')
    .eq('page_id', pageId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!file) throw new Error('File not found')

  const { data, error } = await supabase.storage.from('files').createSignedUrl(file.storage_path, 3600)
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

  after(() => runExtraction(fileId, (file as FileRecord).storage_path, (file as FileRecord).mime_type, workspaceId))

  return file as FileRecord
}

export async function createDatabaseDocPage(
  workspaceId: string,
  databaseId: string,
  filename: string,
  storagePath: string,
  mimeType: string,
  reservedPageId: string
): Promise<{ pageId: string }> {
  if (!DOC_MIME_TYPES.has(mimeType)) throw new Error(`Unsupported file type: ${mimeType}`)

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

  const { data: db } = await supabase.from('databases').select('id, page_id').eq('id', databaseId).single()
  if (!db) throw new Error('Database not found or access denied')
  const { data: containerPage } = await supabase
    .from('pages')
    .select('id')
    .eq('id', db.page_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!containerPage) throw new Error('Database not found or access denied')

  const expectedPrefix = `${workspaceId}/${reservedPageId}/`
  if (!storagePath.startsWith(expectedPrefix)) throw new Error('Invalid storage path')

  const { error: pageError } = await supabase.from('pages').insert({
    id: reservedPageId,
    workspace_id: workspaceId,
    database_id: databaseId,
    parent_id: null,
    title: filename,
    created_by: user.id,
  })
  if (pageError) {
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(pageError.message)
  }

  const { data: fileData, error: fileError } = await supabase
    .from('files')
    .insert({
      workspace_id: workspaceId,
      page_id: reservedPageId,
      storage_path: storagePath,
      mime_type: mimeType,
      extraction_status: 'pending',
    })
    .select('id')
    .single()

  if (fileError || !fileData) {
    await supabase.from('pages').delete().eq('id', reservedPageId)
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(fileError?.message ?? 'Failed to create file record')
  }

  after(() => runDocParse(fileData.id, storagePath, mimeType, workspaceId, reservedPageId))

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return { pageId: reservedPageId }
}

// Stub — replaced with the real implementation in Task 9.
async function runDocParse(_fileId: string, _storagePath: string, _mimeType: string, _workspaceId: string, _pageId: string): Promise<void> {
  return
}
