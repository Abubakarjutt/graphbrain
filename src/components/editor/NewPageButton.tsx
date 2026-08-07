'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
    <button
      onClick={handleClick}
      disabled={isPending}
      className="h-10 px-5 rounded-lg text-[13.5px] font-semibold transition-all active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      style={{
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
        boxShadow: '0 4px 16px -4px oklch(0.52 0.22 240 / 40%)',
      }}
    >
      {isPending ? 'Creating…' : 'New page'}
    </button>
  )
}
