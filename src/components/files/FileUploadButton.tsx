'use client'

import { useRef, useState } from 'react'
import { getUploadUrl, createFilePage } from '@/lib/actions/files'

interface FileUploadButtonProps {
  pageId: string
  workspaceId: string
  onFileCreated: (pageId: string, filename: string) => void
}

export function FileUploadButton({ pageId, workspaceId, onFileCreated }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
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
      const { signedUrl, storagePath, reservedPageId } = await getUploadUrl(
        file.name, file.type, workspaceId
      )

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

      const { pageId: newPageId } = await createFilePage(
        workspaceId, pageId, file.name, storagePath, file.type, reservedPageId
      )
      onFileCreated(newPageId, file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mt-4">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={handleFileChange}
        aria-label="Upload file"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-1"
      >
        {uploading ? `Uploading… ${progress}%` : 'Attach file'}
      </button>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  )
}
