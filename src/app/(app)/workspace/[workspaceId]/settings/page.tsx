import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceDetails } from '@/lib/actions/workspaces'
import { MembersClient } from './MembersClient'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function SettingsPage({ params }: Props) {
  const { workspaceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const details = await getWorkspaceDetails(workspaceId)
  const isOwner = details.workspace.owner_id === user.id

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto px-6 py-10 space-y-10">

        {/* Header */}
        <div>
          <h1 className="font-display text-[2rem] font-light tracking-tight text-foreground mb-1">
            {details.workspace.name}
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--muted-foreground)' }}>
            Organization settings &amp; members
          </p>
        </div>

        <MembersClient
          workspaceId={workspaceId}
          workspace={details.workspace}
          members={details.members}
          invites={details.invites}
          isOwner={isOwner}
          currentUserId={user.id}
          origin={process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:3000`}
        />
      </div>
    </div>
  )
}
