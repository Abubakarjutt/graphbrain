'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPage } from '@/lib/actions/pages'

interface NewDocButtonProps {
  workspaceId: string
  databaseId: string
}

export function NewDocButton({ workspaceId, databaseId }: NewDocButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      const page = await createPage(workspaceId, null, databaseId)
      router.push(`/workspace/${workspaceId}/page/${page.id}`)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-sm font-medium border rounded-md px-3 py-1.5 hover:bg-accent disabled:opacity-50"
    >
      {isPending ? 'Creating…' : 'New doc'}
    </button>
  )
}
