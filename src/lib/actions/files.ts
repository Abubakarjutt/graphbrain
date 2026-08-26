'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { upsertNode, scheduleEmbed } from '@/lib/graph/graph'
import { fileToText, pageToText } from '@/lib/graph/content'
import { textToMarkdown } from '@/lib/parsing/textToMarkdown'
import { docxToMarkdown } from '@/lib/parsing/docxToMarkdown'
import { pdfToMarkdown } from '@/lib/parsing/pdfToMarkdown'
import { markdownToBlocks } from '@/lib/parsing/markdownToBlocks'
import type { FileRecord, Block, TiptapNode } from '@/lib/types/database'

const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
])
// Strip HTML tags and dangerous URIs from extracted text. PDF/DOCX parsing can emit
// raw HTML fragments -- the DB stores this as plain text but it should never be rendered
// as HTML, so stripping keeps any accidental XSS at bay.
function sanitizeExtractedText(text: string | null): string | null {
    if (!text) return null
    let clean = text.replace(/<\/?[a-z][^>]*>/gi, ' ')
    clean = clean.replace(/javascript\s*:/gi, '')
    return clean.trim() || null
}


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
        // Sanitize before storing
        extractedText = sanitizeExtractedText(extractedText)

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

  // Mime allowlist is checked only after the caller is proven to be a member of this
  // workspace AND storagePath is proven to live under this workspace's reserved prefix —
  // the rejection deletes the object, so it must never be reachable for an arbitrary path.
  // The bytes are already in Storage by this point (client uploads via signed URL first),
  // so a rejection has to clean up or it orphans the object in the bucket.
  if (!DOC_MIME_TYPES.has(mimeType)) {
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(`Unsupported file type: ${mimeType}`)
  }

  const { error: pageError } = await supabase.from('pages').insert({
    id: reservedPageId,
    workspace_id: workspaceId,
    parent_id: db.page_id,
    title: filename,
    created_by: user.id,
  })
  if (pageError) {
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(pageError.message)
  }

  // A doc is a database row like any other — this is what makes it show up
  // in Table/Kanban/Calendar instead of living in a separate list.
  const { error: rowError } = await supabase
    .from('database_rows')
    .insert({ database_id: databaseId, page_id: reservedPageId, fields: {} })
  if (rowError) {
    await supabase.from('pages').delete().eq('id', reservedPageId)
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(rowError.message)
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
    await supabase.from('database_rows').delete().eq('page_id', reservedPageId)
    await supabase.from('pages').delete().eq('id', reservedPageId)
    await supabase.storage.from('files').remove([storagePath])
    throw new Error(fileError?.message ?? 'Failed to create file record')
  }

  after(() => runDocParse(fileData.id, storagePath, mimeType, workspaceId, reservedPageId))

  revalidatePath(`/workspace/${workspaceId}/database/${databaseId}`)
  return { pageId: reservedPageId }
}

async function runDocParse(fileId: string, storagePath: string, mimeType: string, workspaceId: string, pageId: string): Promise<void> {
  const supabase = await createClient()

  try {
    const { data: blob, error } = await supabase.storage.from('files').download(storagePath)
    if (error || !blob) throw new Error(error?.message ?? 'Download failed')
    const buffer = Buffer.from(await blob.arrayBuffer())

    let markdown: string
    if (mimeType === 'text/markdown') {
      markdown = buffer.toString('utf-8')
    } else if (mimeType === 'text/plain') {
      markdown = textToMarkdown(buffer)
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      markdown = await docxToMarkdown(buffer)
    } else if (mimeType === 'application/pdf') {
      markdown = await pdfToMarkdown(buffer)
    } else {
      throw new Error(`Unsupported doc mime type: ${mimeType}`)
    }

    // A scanned/image-only PDF (or an empty file) parses to nothing. Fail loudly instead
    // of marking the doc 'done' with zero blocks, which lands the user on a blank editor
    // with no explanation — the error path gives them the Retry/download UX instead.
    if (markdown.trim() === '') throw new Error('No text content could be extracted from this file')

    const doc = markdownToBlocks(markdown)
    const blocks = (doc.content ?? []).map((node: TiptapNode, index: number) => ({
      page_id: pageId,
      type: node.type,
      content: node,
      position: index,
    }))

    // Guard against a Retry that raced a still-running parse: PDF parsing can take minutes,
    // so two runDocParse invocations for the same file can overlap, and the delete+insert
    // below is not atomic. Whichever invocation finishes first flips the status to 'done';
    // any other invocation sees that and backs off rather than duplicating blocks.
    const { data: current } = await supabase
      .from('files')
      .select('extraction_status')
      .eq('id', fileId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (current?.extraction_status === 'done') return

    const { error: deleteError } = await supabase.from('blocks').delete().eq('page_id', pageId)
    if (deleteError) throw new Error(deleteError.message)

    if (blocks.length > 0) {
      const { error: insertError } = await supabase.from('blocks').insert(blocks)
      if (insertError) throw new Error(insertError.message)
    }

    await supabase.from('files').update({ extraction_status: 'done' }).eq('id', fileId)

    // Graph write is independent — parsing already succeeded, never touch extraction_status here
    try {
      const { data: pageRow } = await supabase.from('pages').select('title').eq('id', pageId).single()
      const nodeId = await upsertNode(workspaceId, 'page', pageId)
      await scheduleEmbed(nodeId, pageToText(pageRow?.title ?? 'Untitled', blocks as unknown as Block[]))
    } catch (err) {
      console.error(`runDocParse: graph write failed for page ${pageId}:`, err)
    }
  } catch (err) {
    console.error(`runDocParse: parsing failed for file ${fileId}:`, err)
    await supabase.from('files').update({ extraction_status: 'error' }).eq('id', fileId)
  }
}

export async function retryDocParse(fileId: string, workspaceId: string): Promise<FileRecord> {
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

  const record = file as FileRecord
  if (!record.page_id) throw new Error('File has no associated page')

  // Reset to 'pending' before scheduling the reparse so the client resumes polling —
  // DocProcessing only polls while the status is 'pending', so leaving it on 'error'
  // would leave the user staring at "Import failed" with no sign of progress.
  await supabase.from('files').update({ extraction_status: 'pending' }).eq('id', fileId)

  after(() => runDocParse(fileId, record.storage_path, record.mime_type, workspaceId, record.page_id as string))

  return { ...record, extraction_status: 'pending' as const }
}
