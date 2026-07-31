'use client'

import { useState, useEffect } from 'react'
import type { FileRecord } from '@/lib/types/database'
import { getFileRecord, retryExtraction } from '@/lib/actions/files'

interface FilePageProps {
  fileRecord: FileRecord
  signedUrl: string
  workspaceId: string
}

export function FilePage({ fileRecord: initialRecord, signedUrl, workspaceId }: FilePageProps) {
  const [fileRecord, setFileRecord] = useState(initialRecord)
  const [pollCount, setPollCount] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  useEffect(() => {
    if (fileRecord.extraction_status !== 'pending') return
    if (pollCount >= 10) return

    const timer = setTimeout(async () => {
      const updated = await getFileRecord(fileRecord.page_id!, workspaceId)
      if (updated) setFileRecord(updated)
      setPollCount(c => c + 1)
    }, 3000)

    return () => clearTimeout(timer)
  }, [fileRecord.extraction_status, fileRecord.page_id, pollCount, workspaceId])

  async function handleRetry() {
    setRetrying(true)
    setRetryError(null)
    try {
      const updated = await retryExtraction(fileRecord.id, workspaceId)
      setFileRecord(updated)
      setPollCount(0)
    } catch {
      setRetryError('Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  const isPending = fileRecord.extraction_status === 'pending'
  const isTimedOut = isPending && pollCount >= 10
  const isError = fileRecord.extraction_status === 'error'

  const filename = fileRecord.storage_path.split('/').pop() ?? 'File'

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      {fileRecord.mime_type.startsWith('image/') && (
        <img src={signedUrl} alt={filename} className="max-w-full rounded mb-6" />
      )}
      {fileRecord.mime_type === 'application/pdf' && (
        <iframe src={signedUrl} className="w-full h-[80vh] rounded border mb-6" title="PDF preview" />
      )}

      <a
        href={signedUrl}
        download
        className="text-sm text-muted-foreground hover:underline block mb-6"
      >
        Download file
      </a>

      {isPending && !isTimedOut && (
        <p className="text-sm text-muted-foreground">Indexing…</p>
      )}

      {isTimedOut && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Indexing unavailable</p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="text-sm text-primary hover:underline"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">Extraction failed</p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="text-sm text-primary hover:underline"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
          {retryError && <p className="text-sm text-destructive ml-2">{retryError}</p>}
        </div>
      )}

      {fileRecord.extraction_status === 'done' && fileRecord.extracted_text && (
        <div className="prose max-w-none mt-6">
          <pre className="whitespace-pre-wrap text-sm font-sans">{fileRecord.extracted_text}</pre>
        </div>
      )}
    </div>
  )
}
