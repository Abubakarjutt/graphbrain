'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createPage } from '@/lib/actions/pages'

export function NewPageButton({ workspaceId }: { workspaceId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      const page = await createPage(workspaceId, null)
      router.push(`/workspace/${workspaceId}/page/${page.id}`)
    })
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      {isPending ? 'Creating…' : '+ New Page'}
    </Button>
  )
}
