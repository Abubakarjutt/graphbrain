'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { FileRecord } from '@/lib/types/database'
import { getFileRecord, retryDocParse } from '@/lib/actions/files'

interface DocProcessingProps {
  fileRecord: FileRecord
  workspaceId: string
}

export function DocProcessing({ fileRecord: initialRecord, workspaceId }: DocProcessingProps) {
  const [fileRecord, setFileRecord] = useState(initialRecord)
  const [pollCount, setPollCount] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const router = useRouter()

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

  useEffect(() => {
    if (fileRecord.extraction_status === 'done') router.refresh()
  }, [fileRecord.extraction_status, router])

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
  const isTimedOut = isPending && pollCount >= 10
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
    </div>
  )
}
