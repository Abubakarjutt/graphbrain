'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { FileRecord } from '@/lib/types/database'
import { getFileRecord, retryDocParse, getSignedReadUrl } from '@/lib/actions/files'

interface DocProcessingProps {
  fileRecord: FileRecord
  workspaceId: string
}

// PDFs run every ~7-8k-char chunk through a local LLM sequentially (see pdfToMarkdown),
// which can take minutes on a multi-chunk document — a 30s budget flagged healthy parses
// as stalled. Everything else parses in-process with no LLM, so it stays quick to fail.
export function pollConfigFor(mimeType: string): { intervalMs: number; maxAttempts: number } {
  return mimeType === 'application/pdf'
    ? { intervalMs: 5000, maxAttempts: 120 } // 10 minutes
    : { intervalMs: 3000, maxAttempts: 20 }  // 60 seconds
}

export function DocProcessing({ fileRecord: initialRecord, workspaceId }: DocProcessingProps) {
  const [fileRecord, setFileRecord] = useState(initialRecord)
  const [pollCount, setPollCount] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const router = useRouter()

  const { intervalMs, maxAttempts } = pollConfigFor(fileRecord.mime_type)

  useEffect(() => {
    if (fileRecord.extraction_status !== 'pending') return
    if (pollCount >= maxAttempts) return

    const timer = setTimeout(async () => {
      const updated = await getFileRecord(fileRecord.page_id!, workspaceId)
      if (updated) setFileRecord(updated)
      setPollCount(c => c + 1)
    }, intervalMs)

    return () => clearTimeout(timer)
  }, [fileRecord.extraction_status, fileRecord.page_id, pollCount, workspaceId, intervalMs, maxAttempts])

  useEffect(() => {
    if (fileRecord.extraction_status === 'done') router.refresh()
  }, [fileRecord.extraction_status, router])

  // The original upload stays in Storage regardless of parse status, so fetch the link
  // once on mount — it never changes as polling progresses.
  const pageId = initialRecord.page_id
  useEffect(() => {
    if (!pageId) return
    let cancelled = false
    getSignedReadUrl(pageId, workspaceId)
      .then(({ url }) => { if (!cancelled) setDownloadUrl(url) })
      .catch(() => { /* download link is optional — never block the processing UI */ })
    return () => { cancelled = true }
  }, [pageId, workspaceId])

  async function handleRetry() {
    setRetrying(true)
    setRetryError(null)
    try {
      const updated = await retryDocParse(fileRecord.id, workspaceId)
      setFileRecord(updated)
      setPollCount(0)
    } catch {
      setRetryError('Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  const isPending = fileRecord.extraction_status === 'pending'
  const isTimedOut = isPending && pollCount >= maxAttempts
  const isError = fileRecord.extraction_status === 'error'

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      {isPending && !isTimedOut && (
        <p className="text-sm text-muted-foreground">Processing document…</p>
      )}

      {isTimedOut && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Processing unavailable</p>
          <button onClick={handleRetry} disabled={retrying} className="text-sm text-primary hover:underline">
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">Import failed</p>
          <button onClick={handleRetry} disabled={retrying} className="text-sm text-primary hover:underline">
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
          {retryError && <p className="text-sm text-destructive ml-2">{retryError}</p>}
        </div>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="text-sm text-muted-foreground hover:underline block mt-6"
        >
          Download original
        </a>
      )}
    </div>
  )
}
