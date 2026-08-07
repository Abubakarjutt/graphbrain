'use client'

import { useState, useEffect, useTransition } from 'react'
import { getTimeReport, type UserTimeReport } from '@/lib/actions/todos'

function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
    </div>
  )
}

interface Props {
  databaseId: string
  workspaceId: string
}

export function TimeReportView({ databaseId, workspaceId }: Props) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayISO)
  const [report, setReport] = useState<UserTimeReport[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setLoading(true)
    startTransition(async () => {
      const data = await getTimeReport(databaseId, workspaceId, date)
      setReport(data)
      setLoading(false)
    })
  }, [date, databaseId, workspaceId])

  const maxMs = report[0]?.totalMs ?? 1

  return (
    <div className="flex-1 overflow-y-auto px-14 py-10">
      {/* Header row */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-[1.6rem] font-light text-foreground leading-tight">Time report</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Time logged per member, by day</p>
        </div>
        <input
          type="date"
          value={date}
          max={todayISO}
          onChange={e => setDate(e.target.value)}
          className="text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="8 16" />
          </svg>
          Loading…
        </div>
      )}

      {!loading && report.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="mb-4 text-muted-foreground/30" aria-hidden>
            <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="1.4" />
            <path d="M18 10v8l5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-foreground">No time logged</p>
          <p className="text-xs text-muted-foreground mt-1">Start a task timer on the Kanban board to track time here.</p>
        </div>
      )}

      {!loading && report.length > 0 && (
        <div className="space-y-2">
          {report.map(user => {
            const pct = Math.round((user.totalMs / maxMs) * 100)
            const isExpanded = expandedUser === user.userId

            return (
              <div key={user.userId} className="rounded-xl border border-border overflow-hidden">
                {/* User row */}
                <button
                  type="button"
                  onClick={() => setExpandedUser(isExpanded ? null : user.userId)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent"
                  aria-expanded={isExpanded}
                >
                  {/* Avatar */}
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    {user.email[0].toUpperCase()}
                  </span>

                  {/* Email + bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{user.email}</span>
                      <span className="text-sm font-mono tabular-nums text-muted-foreground ml-4 shrink-0">{fmtMs(user.totalMs)}</span>
                    </div>
                    <Bar pct={pct} />
                  </div>

                  {/* Chevron */}
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className={`shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    aria-hidden
                  >
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Task breakdown */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className="px-5 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task</th>
                          <th className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time</th>
                          <th className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {user.tasks.map(task => {
                          const taskPct = Math.round((task.totalMs / user.totalMs) * 100)
                          return (
                            <tr key={task.itemId} className="border-b border-border/40 last:border-0">
                              <td className="px-5 py-3 text-foreground">{task.itemTitle || 'Untitled'}</td>
                              <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">{fmtMs(task.totalMs)}</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2 justify-end">
                                  <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{taskPct}%</span>
                                  <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${taskPct}%`, background: 'var(--spark)' }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="px-5 py-2 text-xs font-semibold text-muted-foreground">Total</td>
                          <td className="px-5 py-2 text-right text-xs font-mono font-semibold text-foreground tabular-nums">{fmtMs(user.totalMs)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
