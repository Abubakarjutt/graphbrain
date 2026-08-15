'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getUploadUrl, createDatabaseDocPage } from '@/lib/actions/files'

interface DocUploadButtonProps {
  databaseId: string
  workspaceId: string
}

const ACCEPTED = '.pdf,.docx,.doc,.txt,.md'

const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  md: 'text/markdown',
}

const ACCEPTED_MIME_TYPES = new Set(Object.values(EXTENSION_MIME_TYPES))

// Browsers report an empty (or wrong) MIME type for `.md` and sometimes `.doc`, depending on
// the OS's MIME registry — the server allowlist would then reject the doc after the bytes have
// already uploaded. Fall back to the extension, but only for extensions we actually accept:
// anything else keeps the browser's value so the server still rejects it.
export function effectiveMimeType(filename: string, browserType: string): string {
  if (browserType && ACCEPTED_MIME_TYPES.has(browserType)) return browserType
  const extension = filename.toLowerCase().split('.').pop() ?? ''
  return EXTENSION_MIME_TYPES[extension] ?? browserType
}

export function DocUploadButton({ databaseId, workspaceId }: DocUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      const mimeType = effectiveMimeType(file.name, file.type)
      const { signedUrl, storagePath, reservedPageId } = await getUploadUrl(file.name, mimeType, workspaceId)

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (ev: ProgressEvent) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.open('PUT', signedUrl)
        xhr.setRequestHeader('Content-Type', mimeType || 'application/octet-stream')
        xhr.send(file)
      })

      const { pageId } = await createDatabaseDocPage(workspaceId, databaseId, file.name, storagePath, mimeType, reservedPageId)
      router.push(`/workspace/${workspaceId}/page/${pageId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={handleFileChange}
        aria-label="Upload document"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-sm font-medium border rounded-md px-3 py-1.5 hover:bg-accent disabled:opacity-50"
      >
        {uploading ? `Uploading… ${progress}%` : 'Upload document'}
      </button>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  )
}
