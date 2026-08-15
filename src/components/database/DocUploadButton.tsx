'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getUploadUrl, createDatabaseDocPage } from '@/lib/actions/files'

interface DocUploadButtonProps {
  databaseId: string
  workspaceId: string
}

const ACCEPTED = '.pdf,.docx,.doc,.txt,.md'

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
      const { signedUrl, storagePath, reservedPageId } = await getUploadUrl(file.name, file.type, workspaceId)

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
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      const { pageId } = await createDatabaseDocPage(workspaceId, databaseId, file.name, storagePath, file.type, reservedPageId)
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
