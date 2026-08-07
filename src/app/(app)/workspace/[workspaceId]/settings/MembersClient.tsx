'use client'

import { useState, useTransition } from 'react'
import { sendInvite, revokeInvite, removeMember } from '@/lib/actions/workspaces'
import type { WorkspaceMember, WorkspaceInvite } from '@/lib/actions/workspaces'

interface Props {
  workspaceId: string
  workspace: { id: string; name: string; owner_id: string }
  members: WorkspaceMember[]
  invites: WorkspaceInvite[]
  isOwner: boolean
  currentUserId: string
  origin: string
}

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  owner:  { color: 'oklch(0.52 0.22 240)', bg: 'oklch(0.52 0.22 240 / 12%)' },
  editor: { color: 'oklch(0.60 0.18 150)', bg: 'oklch(0.60 0.18 150 / 12%)' },
  viewer: { color: 'oklch(0.55 0.02 255)', bg: 'oklch(0.55 0.02 255 / 12%)' },
}

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? ROLE_COLORS.viewer
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
      style={{ color: c.color, background: c.bg }}>
      {role}
    </span>
  )
}

function Avatar({ email }: { email: string }) {
  return (
    <span className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold shrink-0"
      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
      {email[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

export function MembersClient({ workspaceId, workspace, members: initialMembers, invites: initialInvites, isOwner, currentUserId, origin }: Props) {
  const [members, setMembers] = useState(initialMembers)
  const [invites, setInvites] = useState(initialInvites)
  const [, startTransition] = useTransition()

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [newLink, setNewLink] = useState<{ email: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setInviteLoading(true)
    setInviteError(null)
    setNewLink(null)
    try {
      const { token } = await sendInvite(workspaceId, email, inviteRole)
      const url = `${origin}/invite/${token}`
      setNewLink({ email, url })
      setInviteEmail('')
      // Optimistically add to pending invites list
      setInvites(prev => [{
        id: crypto.randomUUID(),
        invited_email: email,
        role: inviteRole,
        token,
        accepted_at: null,
        created_at: new Date().toISOString(),
      }, ...prev])
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviteLoading(false)
    }
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleRevokeInvite(id: string) {
    setInvites(prev => prev.filter(i => i.id !== id))
    startTransition(() => revokeInvite(id, workspaceId))
  }

  function handleRemoveMember(userId: string) {
    setMembers(prev => prev.filter(m => m.user_id !== userId))
    startTransition(() => removeMember(workspaceId, userId))
  }

  const pendingInvites = invites.filter(i => !i.accepted_at)

  return (
    <div className="space-y-8">

      {/* ── Members ───────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[11px] font-bold tracking-[0.08em] uppercase mb-3"
          style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
          Members · {members.length}
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {members.map((m, i) => (
            <div key={m.user_id}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                background: 'var(--card)',
              }}>
              <Avatar email={m.email} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: 'var(--foreground)' }}>
                  {m.email}
                  {m.user_id === currentUserId && (
                    <span className="ml-2 text-[10px] font-normal" style={{ color: 'var(--muted-foreground)' }}>you</span>
                  )}
                </p>
              </div>
              <RoleBadge role={m.role} />
              {isOwner && m.user_id !== currentUserId && m.role !== 'owner' && (
                <button type="button"
                  onClick={() => handleRemoveMember(m.user_id)}
                  className="h-7 px-2.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors ml-2"
                  style={{ color: 'oklch(0.57 0.24 27)', background: 'oklch(0.57 0.24 27 / 8%)' }}
                  title="Remove member">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Invite ────────────────────────────────────────────────────────── */}
      {isOwner && (
        <section>
          <h2 className="text-[11px] font-bold tracking-[0.08em] uppercase mb-3"
            style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
            Invite people
          </h2>
          <form onSubmit={handleInvite}
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                className="flex-1 h-9 text-[13px] rounded-lg px-3 outline-none bg-transparent"
                style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
                aria-label="Email to invite"
              />
              {/* Role toggle */}
              <div className="flex gap-1 p-1 rounded-lg shrink-0" style={{ background: 'var(--muted)' }}>
                {(['editor', 'viewer'] as const).map(r => (
                  <button key={r} type="button" onClick={() => setInviteRole(r)}
                    className="h-7 px-2.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors capitalize"
                    style={{
                      background: inviteRole === r ? 'var(--card)' : 'transparent',
                      color: inviteRole === r ? 'var(--foreground)' : 'var(--muted-foreground)',
                      boxShadow: inviteRole === r ? '0 1px 3px oklch(0 0 0 / 0.08)' : undefined,
                    }}>
                    {r}
                  </button>
                ))}
              </div>
              <button type="submit" disabled={inviteLoading}
                className="h-9 px-4 text-[13px] font-semibold rounded-lg cursor-pointer transition-all shrink-0"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 2px 8px oklch(0.52 0.22 240 / 25%)' }}>
                {inviteLoading ? 'Sending…' : 'Send invite'}
              </button>
            </div>

            {inviteError && (
              <p className="text-[12px]" style={{ color: 'oklch(0.57 0.24 27)' }}>{inviteError}</p>
            )}

            {/* Generated link */}
            {newLink && (
              <div className="rounded-lg p-3 space-y-1.5"
                style={{ background: 'oklch(0.52 0.22 240 / 7%)', border: '1px solid oklch(0.52 0.22 240 / 20%)' }}>
                <p className="text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
                  Invite link for <span style={{ color: 'var(--foreground)' }}>{newLink.email}</span>
                </p>
                <div className="flex items-center gap-2">
                  <input readOnly value={newLink.url}
                    className="flex-1 text-[11px] font-mono bg-transparent outline-none truncate"
                    style={{ color: 'var(--primary)' }}
                    onFocus={e => e.target.select()} />
                  <button type="button" onClick={() => handleCopy(newLink.url)}
                    className="shrink-0 h-7 px-2.5 text-[11px] font-semibold rounded-md cursor-pointer transition-colors"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>
      )}

      {/* ── Pending invites ───────────────────────────────────────────────── */}
      {pendingInvites.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold tracking-[0.08em] uppercase mb-3"
            style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
            Pending invites · {pendingInvites.length}
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {pendingInvites.map((inv, i) => (
              <div key={inv.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  background: 'var(--card)',
                }}>
                {/* Ghost avatar */}
                <span className="w-8 h-8 rounded-full grid place-items-center shrink-0"
                  style={{ background: 'var(--muted)', border: '1.5px dashed var(--border)' }}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <circle cx="7" cy="5" r="2.5" stroke="var(--muted-foreground)" strokeWidth="1.2" opacity="0.5"/>
                    <path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="var(--muted-foreground)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--foreground)' }}>
                    {inv.invited_email}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                    Invite pending · {new Date(inv.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <RoleBadge role={inv.role} />
                <div className="flex items-center gap-1.5 ml-2">
                  <button type="button"
                    onClick={() => handleCopy(`${origin}/invite/${inv.token}`)}
                    className="h-7 px-2.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors"
                    style={{ color: 'var(--primary)', background: 'oklch(0.52 0.22 240 / 8%)' }}>
                    Copy link
                  </button>
                  {isOwner && (
                    <button type="button"
                      onClick={() => handleRevokeInvite(inv.id)}
                      className="h-7 px-2.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors"
                      style={{ color: 'oklch(0.57 0.24 27)', background: 'oklch(0.57 0.24 27 / 8%)' }}>
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Accepted invites (collapsed summary) ──────────────────────────── */}
      {invites.some(i => i.accepted_at) && (
        <section>
          <h2 className="text-[11px] font-bold tracking-[0.08em] uppercase mb-3"
            style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
            Accepted invites
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {invites.filter(i => i.accepted_at).map((inv, i) => (
              <div key={inv.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  background: 'var(--card)',
                }}>
                <span className="w-8 h-8 rounded-full grid place-items-center shrink-0"
                  style={{ background: 'oklch(0.60 0.18 150 / 15%)' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                    <path d="M1.5 5.5l2.5 2.5 6-6" stroke="oklch(0.60 0.18 150)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--foreground)' }}>
                    {inv.invited_email}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                    Joined {new Date(inv.accepted_at!).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <RoleBadge role={inv.role} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
