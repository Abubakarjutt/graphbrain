'use client'

import Link from 'next/link'
import type { Page } from '@/lib/types/database'
import { NewDocButton } from './NewDocButton'
import { DocUploadButton } from './DocUploadButton'

interface DocsViewProps {
  databaseId: string
  workspaceId: string
  docs: Page[]
}

export function DocsView({ databaseId, workspaceId, docs }: DocsViewProps) {
  return (
    <div className="px-14 py-6">
      <div className="flex items-center gap-2 mb-6">
        <NewDocButton workspaceId={workspaceId} databaseId={databaseId} />
        <DocUploadButton workspaceId={workspaceId} databaseId={databaseId} />
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No docs yet.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {docs.map(doc => (
            <li key={doc.id}>
              <Link
                href={`/workspace/${workspaceId}/page/${doc.id}`}
                className="block py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {doc.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
