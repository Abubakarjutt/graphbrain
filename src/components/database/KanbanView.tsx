'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Page, TodoBoard, TodoItemWithPage, TodoList } from '@/lib/types/database'
import {
  createTodoList,
  renameTodoList,
  reorderTodoList,
  deleteTodoList,
  createTodoItem,
  updateTodoItem,
  deleteTodoItem,
  attachPageToTodoItem,
} from '@/lib/actions/todos'
import { TodoAttachDocumentPicker } from './TodoAttachDocumentPicker'

// ─── Local types ──────────────────────────────────────────────────────────────

type Priority = 'urgent' | 'high' | 'medium' | 'low' | null

interface TaskMeta {
  priority: Priority
  labels: string[]
  description: string
  estimate: number | null
}

interface TimeEntry {
  id: string
  startedAt: number
  stoppedAt: number | null
}

interface TimeLog {
  entries: TimeEntry[]
}

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY: Record<NonNullable<Priority>, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: 'oklch(0.57 0.24 27)',  bg: 'oklch(0.57 0.24 27 / 12%)'  },
  high:   { label: 'High',   color: 'oklch(0.62 0.20 50)',  bg: 'oklch(0.62 0.20 50 / 12%)'  },
  medium: { label: 'Medium', color: 'oklch(0.72 0.15 80)',  bg: 'oklch(0.72 0.15 80 / 12%)'  },
  low:    { label: 'Low',    color: 'oklch(0.55 0.10 240)', bg: 'oklch(0.55 0.10 240 / 12%)' },
}

const LABEL_PALETTE = [
  'oklch(0.55 0.16 240)',
  'oklch(0.52 0.18 150)',
  'oklch(0.52 0.18 285)',
  'oklch(0.62 0.20 50)',
  'oklch(0.57 0.24 27)',
  'oklch(0.72 0.15 80)',
]

function columnAccent(name: string) {
  const n = name.toLowerCase()
  if (/done|complet|finish|ship|clos/.test(n))   return { dot: 'oklch(0.60 0.18 150)', tint: 'oklch(0.60 0.18 150 / 7%)'  }
  if (/progress|doing|active|work|dev/.test(n))  return { dot: 'oklch(0.52 0.22 240)', tint: 'oklch(0.52 0.22 240 / 7%)'  }
  if (/review|qa|test|check|verify/.test(n))     return { dot: 'oklch(0.52 0.18 285)', tint: 'oklch(0.52 0.18 285 / 7%)'  }
  if (/block|hold|stuck|wait|pause/.test(n))     return { dot: 'oklch(0.57 0.24 27)',  tint: 'oklch(0.57 0.24 27  / 7%)'  }
  return { dot: 'oklch(0.50 0.02 255)', tint: 'oklch(0 0 0 / 2.5%)' }
}

// ─── Time utilities ───────────────────────────────────────────────────────────

function msToDisplay(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function timerDisplay(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

// ─── localStorage persistence ─────────────────────────────────────────────────

const META_KEY  = (id: string) => `gb:meta:${id}`
const TIME_KEY  = (id: string) => `gb:time:${id}`

function readMeta(id: string): TaskMeta {
  if (typeof window === 'undefined') return { priority: null, labels: [], description: '', estimate: null }
  try { const r = localStorage.getItem(META_KEY(id)); return r ? JSON.parse(r) : { priority: null, labels: [], description: '', estimate: null } }
  catch { return { priority: null, labels: [], description: '', estimate: null } }
}
function writeMeta(id: string, m: TaskMeta) {
  if (typeof window !== 'undefined') localStorage.setItem(META_KEY(id), JSON.stringify(m))
}
function readTimeLog(id: string): TimeLog {
  if (typeof window === 'undefined') return { entries: [] }
  try { const r = localStorage.getItem(TIME_KEY(id)); return r ? JSON.parse(r) : { entries: [] } }
  catch { return { entries: [] } }
}
function writeTimeLog(id: string, l: TimeLog) {
  if (typeof window !== 'undefined') localStorage.setItem(TIME_KEY(id), JSON.stringify(l))
}

// ─── Module-level time-log sync (card + drawer share one live state) ──────────

const TIME_CACHE = new Map<string, TimeLog>()
const TIME_SUBS  = new Map<string, Set<(l: TimeLog) => void>>()

function getCached(id: string): TimeLog {
  if (!TIME_CACHE.has(id)) TIME_CACHE.set(id, readTimeLog(id))
  return TIME_CACHE.get(id)!
}
function setCached(id: string, log: TimeLog) {
  TIME_CACHE.set(id, log)
  writeTimeLog(id, log)
  TIME_SUBS.get(id)?.forEach(fn => fn(log))
}
function subscribe(id: string, fn: (l: TimeLog) => void) {
  const s = TIME_SUBS.get(id) ?? new Set()
  s.add(fn)
  TIME_SUBS.set(id, s)
  return () => { s.delete(fn) }
}

// ─── useTimeLogger hook ───────────────────────────────────────────────────────

function useTimeLogger(itemId: string) {
  const [log, setLog] = useState<TimeLog>(() => getCached(itemId))
  const [, tick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLog(getCached(itemId))
    const unsub = subscribe(itemId, setLog)
    return () => { unsub() }
  }, [itemId])

  const activeEntry = log.entries.find(e => e.stoppedAt === null) ?? null
  const isRunning = activeEntry !== null

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => tick(t => t + 1), 1000)
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning])

  const elapsedMs   = activeEntry ? Date.now() - activeEntry.startedAt : 0
  const completedMs = log.entries.filter(e => e.stoppedAt).reduce((s, e) => s + (e.stoppedAt! - e.startedAt), 0)
  const totalMs     = completedMs + elapsedMs

  function start() {
    if (isRunning) return
    const entry: TimeEntry = { id: crypto.randomUUID(), startedAt: Date.now(), stoppedAt: null }
    setCached(itemId, { entries: [...log.entries, entry] })
  }
  function stop() {
    if (!isRunning) return
    setCached(itemId, { entries: log.entries.map(e => e.stoppedAt === null ? { ...e, stoppedAt: Date.now() } : e) })
  }
  function deleteEntry(eid: string) {
    setCached(itemId, { entries: log.entries.filter(e => e.id !== eid) })
  }

  return { log, isRunning, elapsedMs, totalMs, start, stop, deleteEntry }
}

// ─── PriorityIcon ─────────────────────────────────────────────────────────────

function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === 'urgent') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1.5v6M7 10.5v1" stroke={PRIORITY.urgent.color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
  if (priority === 'high') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 10l5-6 5 6" stroke={PRIORITY.high.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (priority === 'medium') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 5h9M2.5 9h9" stroke={PRIORITY.medium.color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
  if (priority === 'low') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 4l5 6 5-6" stroke={PRIORITY.low.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="var(--border)" strokeWidth="1.4"/>
    </svg>
  )
}

// ─── PriorityMenu ─────────────────────────────────────────────────────────────

function PriorityMenu({ priority, onChange }: { priority: Priority; onChange: (p: Priority) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = priority ? PRIORITY[priority] : null
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium rounded-md px-2 py-1 transition-colors cursor-pointer"
        style={cfg ? { color: cfg.color, background: cfg.bg } : { color: 'var(--muted-foreground)', background: 'var(--muted)' }}
        title="Set priority"
      >
        <PriorityIcon priority={priority} size={11} />
        {cfg ? cfg.label : 'No priority'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full left-0 mt-1 z-[61] rounded-lg py-1 min-w-[130px] shadow-lg overflow-hidden"
            style={{ background: 'var(--popover)', border: '1px solid var(--border)' }}>
            <button type="button" onClick={() => { onChange(null); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--accent)] transition-colors flex items-center gap-2 cursor-pointer"
              style={{ color: 'var(--muted-foreground)' }}>
              <PriorityIcon priority={null} size={12} /> No priority
            </button>
            {(Object.keys(PRIORITY) as NonNullable<Priority>[]).map(k => (
              <button key={k} type="button" onClick={() => { onChange(k); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--accent)] transition-colors flex items-center gap-2 cursor-pointer"
                style={{ color: PRIORITY[k].color }}>
                <PriorityIcon priority={k} size={12} /> {PRIORITY[k].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── TaskDetailDrawer ─────────────────────────────────────────────────────────

interface DrawerProps {
  item: TodoItemWithPage
  lists: TodoList[]
  assignees: { id: string; email: string }[]
  pages: Page[]
  workspaceId: string
  meta: TaskMeta
  onMetaChange: (patch: Partial<TaskMeta>) => void
  onRename: (title: string) => void
  onSetDueDate: (d: string | null) => void
  onAssign: (id: string | null) => void
  onMoveToList: (listId: string) => void
  onDelete: () => void
  onAttach: (page: Page) => void
  onDetach: () => void
  onClose: () => void
}

function TaskDetailDrawer({
  item, lists, assignees, pages, workspaceId, meta,
  onMetaChange, onRename, onSetDueDate, onAssign, onMoveToList, onDelete, onAttach, onDetach, onClose
}: DrawerProps) {
  const { log, isRunning, elapsedMs, totalMs, start, stop, deleteEntry } = useTimeLogger(item.id)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [descDraft, setDescDraft]   = useState(meta.description)
  const [newLabel, setNewLabel]     = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const currentList = lists.find(l => l.id === item.list_id)

  function commitTitle() { if (titleDraft.trim() && titleDraft.trim() !== item.title) onRename(titleDraft.trim()) }
  function commitDesc()  { onMetaChange({ description: descDraft }) }
  function addLabel()    {
    const t = newLabel.trim()
    if (!t || meta.labels.includes(t)) { setNewLabel(''); return }
    onMetaChange({ labels: [...meta.labels, t] }); setNewLabel('')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'oklch(0 0 0 / 45%)' }} onClick={onClose}>
      <div
        className="relative w-full max-w-[540px] h-full flex flex-col animate-slide-in-right overflow-hidden"
        style={{ background: 'var(--background)', borderLeft: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-3.5 shrink-0 sticky top-0 z-10"
          style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityMenu priority={meta.priority} onChange={p => onMetaChange({ priority: p })} />
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
              {currentList?.name ?? '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => { onDelete(); onClose() }}
              className="h-7 px-2.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors"
              style={{ color: 'oklch(0.57 0.24 27)', background: 'oklch(0.57 0.24 27 / 9%)' }}>
              Delete
            </button>
            <button type="button" onClick={onClose} aria-label="Close drawer"
              className="h-7 w-7 grid place-items-center rounded-md cursor-pointer transition-colors hover:bg-[var(--accent)]"
              style={{ color: 'var(--muted-foreground)' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 sidebar-scroll">

          {/* Title */}
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            className="w-full text-[1.2rem] font-semibold bg-transparent outline-none leading-snug"
            style={{ color: 'var(--foreground)' }}
            placeholder="Task title"
            aria-label="Task title"
          />

          {/* Properties grid */}
          <div className="space-y-2.5">
            <p className="nav-label">Properties</p>
            {[
              {
                label: 'Assignee',
                control: (
                  <select value={item.assignee?.id ?? ''} onChange={e => onAssign(e.target.value || null)}
                    className="text-[12.5px] bg-transparent rounded-md px-2 py-1 cursor-pointer outline-none"
                    style={{ border: '1px solid var(--border)', color: 'var(--foreground)', minWidth: 120 }}>
                    <option value="">Unassigned</option>
                    {assignees.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
                  </select>
                ),
              },
              {
                label: 'Due date',
                control: (
                  <input type="date" value={item.due_date ?? ''} onChange={e => onSetDueDate(e.target.value || null)}
                    className="text-[12.5px] bg-transparent rounded-md px-2 py-1 cursor-pointer outline-none"
                    style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                ),
              },
              {
                label: 'Column',
                control: (
                  <select value={item.list_id} onChange={e => onMoveToList(e.target.value)}
                    className="text-[12.5px] bg-transparent rounded-md px-2 py-1 cursor-pointer outline-none"
                    style={{ border: '1px solid var(--border)', color: 'var(--foreground)', minWidth: 120 }}>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                ),
              },
              {
                label: 'Estimate',
                control: (
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" step="0.5" value={meta.estimate ?? ''} placeholder="—"
                      onChange={e => onMetaChange({ estimate: e.target.value ? Number(e.target.value) : null })}
                      className="w-16 text-[12.5px] bg-transparent rounded-md px-2 py-1 outline-none"
                      style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                    <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>hours</span>
                  </div>
                ),
              },
            ].map(({ label, control }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[12px]" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
                {control}
              </div>
            ))}
          </div>

          {/* Labels */}
          <div>
            <p className="nav-label mb-2.5">Labels</p>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {meta.labels.map((label, i) => (
                <span key={label} className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ color: LABEL_PALETTE[i % LABEL_PALETTE.length], background: `${LABEL_PALETTE[i % LABEL_PALETTE.length]}18`, border: `1px solid ${LABEL_PALETTE[i % LABEL_PALETTE.length]}30` }}>
                  {label}
                  <button type="button" onClick={() => onMetaChange({ labels: meta.labels.filter(l => l !== label) })}
                    className="opacity-50 hover:opacity-100 cursor-pointer ml-0.5" aria-label={`Remove ${label}`}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                      <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addLabel()}
                placeholder="Add label…"
                className="flex-1 text-[12px] bg-transparent rounded-md px-2.5 py-1.5 outline-none"
                style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} />
              <button type="button" onClick={addLabel}
                className="h-8 px-3 text-[12px] font-medium rounded-md cursor-pointer transition-colors"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                Add
              </button>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="nav-label mb-2.5">Description</p>
            <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} onBlur={commitDesc}
              placeholder="Add a description…" rows={4}
              className="w-full text-[13px] leading-relaxed bg-transparent rounded-lg px-3 py-2.5 outline-none resize-none"
              style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} />
          </div>

          {/* Linked document */}
          <div>
            <p className="nav-label mb-2.5">Linked document</p>
            {item.attached_page_id ? (
              <div className="flex items-center gap-2.5">
                <Link href={`/workspace/${workspaceId}/page/${item.attached_page_id}`}
                  onClick={onClose}
                  className="flex items-center gap-1.5 text-[13px] hover:underline"
                  style={{ color: 'var(--primary)' }}>
                  <svg width="12" height="12" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.7 }} aria-hidden>
                    <path d="M3 2h5.5L10 3.5V11H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                    <path d="M8.5 2v1.5H10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                  </svg>
                  {item.attached_page_title || 'Untitled'}
                </Link>
                <button type="button" onClick={onDetach}
                  className="text-[11px] cursor-pointer transition-colors"
                  style={{ color: 'var(--muted-foreground)' }}>Remove</button>
              </div>
            ) : (
              <div className="relative">
                <button type="button" onClick={() => setPickerOpen(true)}
                  className="flex items-center gap-1.5 text-[12px] cursor-pointer transition-colors"
                  style={{ color: 'var(--muted-foreground)' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                    <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Link document
                </button>
                {pickerOpen && (
                  <TodoAttachDocumentPicker pages={pages}
                    onSelect={p => { onAttach(p); setPickerOpen(false) }}
                    onClose={() => setPickerOpen(false)} />
                )}
              </div>
            )}
          </div>

          {/* ── Time Logging ────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="nav-label">Time logged</p>
              {totalMs > 0 && (
                <span className="text-[12px] font-mono font-semibold tabular-nums" style={{ color: 'var(--primary)' }}>
                  {msToDisplay(totalMs)} total
                </span>
              )}
            </div>

            {/* Timer control */}
            <div className="flex items-center gap-3 p-3 rounded-lg mb-3"
              style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
              {isRunning ? (
                <>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--spark)', flexShrink: 0 }} />
                  <span className="font-mono text-[15px] font-semibold tabular-nums flex-1" style={{ color: 'var(--spark)' }}>
                    {timerDisplay(elapsedMs)}
                  </span>
                  <button type="button" onClick={stop}
                    className="flex items-center gap-1.5 h-8 px-3.5 text-[12px] font-semibold rounded-md cursor-pointer transition-colors"
                    style={{ background: 'oklch(0.57 0.24 27 / 14%)', color: 'oklch(0.57 0.24 27)' }}>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden>
                      <rect x="1" y="1" width="7" height="7" rx="0.5"/>
                    </svg>
                    Stop
                  </button>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} aria-hidden>
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M7 4v3.2l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  <span className="text-[13px] flex-1" style={{ color: 'var(--muted-foreground)' }}>
                    {totalMs > 0 ? `${msToDisplay(totalMs)} logged` : 'No time logged yet'}
                  </span>
                  <button type="button" onClick={start}
                    className="flex items-center gap-1.5 h-8 px-3.5 text-[12px] font-semibold rounded-md cursor-pointer transition-all active:scale-[0.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 2px 8px oklch(0.52 0.22 240 / 25%)' }}>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden>
                      <path d="M1.5 1l7 3.5-7 3.5z"/>
                    </svg>
                    Start timer
                  </button>
                </>
              )}
            </div>

            {/* Log entries */}
            {log.entries.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold tracking-[0.08em] uppercase mb-1.5" style={{ color: 'var(--muted-foreground)', opacity: 0.55 }}>
                  Log history
                </p>
                {[...log.entries].reverse().map(entry => {
                  const dur = entry.stoppedAt ? entry.stoppedAt - entry.startedAt : Date.now() - entry.startedAt
                  const started = new Date(entry.startedAt)
                  return (
                    <div key={entry.id} className="flex items-center justify-between px-3 py-2 rounded-md text-[12px]"
                      style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        {!entry.stoppedAt && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: 'var(--spark)' }} />}
                        <span className="font-mono font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>
                          {msToDisplay(dur)}
                        </span>
                        <span className="text-[11px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                          {started.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {entry.stoppedAt && ` – ${new Date(entry.stoppedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                      </div>
                      <button type="button" onClick={() => deleteEntry(entry.id)}
                        className="opacity-30 hover:opacity-100 transition-opacity cursor-pointer shrink-0 ml-2"
                        style={{ color: 'var(--muted-foreground)' }} aria-label="Delete log entry">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── KanbanCard ───────────────────────────────────────────────────────────────

interface CardProps {
  item: TodoItemWithPage
  workspaceId: string
  pages: Page[]
  allLists: TodoList[]
  assignees: { id: string; email: string }[]
  onRename: (itemId: string, title: string) => void
  onSetDueDate: (itemId: string, d: string | null) => void
  onAssign: (itemId: string, assigneeId: string | null) => void
  onMoveToList: (itemId: string, listId: string) => void
  onDelete: (itemId: string) => void
  onAttach: (itemId: string, page: Page) => void
  onDetach: (itemId: string) => void
}

function KanbanCard({ item, workspaceId, pages, allLists, assignees, onRename, onSetDueDate, onAssign, onMoveToList, onDelete, onAttach, onDetach }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [meta, setMeta] = useState<TaskMeta>(() => readMeta(item.id))
  const { isRunning, elapsedMs, totalMs, start, stop } = useTimeLogger(item.id)

  const style = { transform: CSS.Transform.toString(transform), opacity: isDragging ? 0.35 : 1, zIndex: isDragging ? 50 : undefined }

  function handleMetaChange(patch: Partial<TaskMeta>) {
    const next = { ...meta, ...patch }
    setMeta(next)
    writeMeta(item.id, next)
  }

  const isOverdue = item.due_date && new Date(item.due_date) < new Date()
  const hasMeta = meta.priority || meta.labels.length > 0

  return (
    <>
      <div ref={setNodeRef}
        style={{ ...style, background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 1px 3px oklch(0 0 0 / 0.05)' }}
        className="group relative rounded-lg select-none transition-shadow hover:shadow-[0_3px_10px_oklch(0_0_0/0.10)]">

        {/* Drag handle */}
        <div {...attributes} {...listeners}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 rounded"
          aria-label="Drag to reorder">
          <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden>
            <circle cx="2" cy="1.5" r="1.1" fill="var(--muted-foreground)" opacity="0.4"/>
            <circle cx="7" cy="1.5" r="1.1" fill="var(--muted-foreground)" opacity="0.4"/>
            <circle cx="12" cy="1.5" r="1.1" fill="var(--muted-foreground)" opacity="0.4"/>
            <circle cx="2" cy="7.5" r="1.1" fill="var(--muted-foreground)" opacity="0.4"/>
            <circle cx="7" cy="7.5" r="1.1" fill="var(--muted-foreground)" opacity="0.4"/>
            <circle cx="12" cy="7.5" r="1.1" fill="var(--muted-foreground)" opacity="0.4"/>
          </svg>
        </div>

        <div className="p-3">
          {/* Priority + labels */}
          {hasMeta && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {meta.priority && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ color: PRIORITY[meta.priority].color, background: PRIORITY[meta.priority].bg }}>
                  <PriorityIcon priority={meta.priority} size={9} />
                  {PRIORITY[meta.priority].label}
                </span>
              )}
              {meta.labels.map((label, i) => (
                <span key={label} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ color: LABEL_PALETTE[i % LABEL_PALETTE.length], background: `${LABEL_PALETTE[i % LABEL_PALETTE.length]}16` }}>
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <button type="button" onClick={() => setDrawerOpen(true)}
            className="text-[13px] font-medium text-left w-full leading-snug mb-3 pr-5 cursor-pointer transition-colors hover:text-[var(--primary)]"
            style={{ color: 'var(--foreground)' }}>
            {item.title}
          </button>

          {/* Properties table */}
          <div className="mt-2.5 pt-2.5 space-y-1.5"
            style={{ borderTop: '1px solid var(--border)' }}>

            {/* Assignee */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wide uppercase"
                style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Assignee</span>
              {item.assignee ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold shrink-0"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                    {item.assignee.email[0].toUpperCase()}
                  </span>
                  <span className="text-[11px] truncate" style={{ color: 'var(--foreground)' }}>
                    {item.assignee.email.split('@')[0]}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] italic" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }}>Unassigned</span>
              )}
            </div>

            {/* Due date */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wide uppercase"
                style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Due</span>
              {item.due_date ? (
                <span className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: isOverdue ? 'oklch(0.57 0.24 27)' : 'var(--foreground)' }}>
                  {isOverdue && (
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                      <circle cx="4.5" cy="4.5" r="4" stroke="currentColor" strokeWidth="1"/>
                      <path d="M4.5 2.5v2.2M4.5 6.5v.3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  )}
                  {new Date(item.due_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  {isOverdue && <span className="text-[9px] font-semibold ml-1 px-1 py-px rounded"
                    style={{ background: 'oklch(0.57 0.24 27 / 12%)' }}>overdue</span>}
                </span>
              ) : (
                <span className="text-[11px] italic" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }}>None</span>
              )}
            </div>

            {/* Created */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wide uppercase"
                style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Created</span>
              <span className="text-[11px]" style={{ color: 'var(--muted-foreground)', opacity: 0.65 }}>
                {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            {/* Time logged — only when there's something to show */}
            {(totalMs > 0 || isRunning) && (
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wide uppercase"
                  style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Time</span>
                {isRunning ? (
                  <span className="text-[11px] font-mono font-semibold tabular-nums animate-pulse"
                    style={{ color: 'var(--spark)' }}>▶ {timerDisplay(elapsedMs)}</span>
                ) : (
                  <span className="text-[11px] font-mono" style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>
                    {msToDisplay(totalMs)}
                  </span>
                )}
              </div>
            )}

            {/* Linked doc — only when attached */}
            {item.attached_page_id && (
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wide uppercase"
                  style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Doc</span>
                <span className="flex items-center gap-1 text-[11px] truncate" style={{ color: 'var(--primary)' }}>
                  <svg width="9" height="9" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <path d="M3 2h5.5L10 3.5V11H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                    <path d="M8.5 2v1.5H10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                  </svg>
                  {item.attached_page_title || 'Linked'}
                </span>
              </div>
            )}
          </div>

          {/* Timer quick-action — bottom right, hover only */}
          <div className="flex justify-end mt-2">
            <button type="button"
              onClick={e => { e.stopPropagation(); isRunning ? stop() : start() }}
              title={isRunning ? 'Stop timer' : 'Start timer'}
              aria-label={isRunning ? 'Stop timer' : 'Start timer'}
              className="flex items-center gap-1.5 h-6 px-2 text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              style={{
                background: isRunning ? 'oklch(0.57 0.24 27 / 14%)' : 'var(--muted)',
                color: isRunning ? 'oklch(0.57 0.24 27)' : 'var(--muted-foreground)',
              }}>
              {isRunning ? (
                <><svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor" aria-hidden><rect x="1" y="1" width="6" height="6" rx="0.5"/></svg>Stop</>
              ) : (
                <><svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor" aria-hidden><path d="M1.5 1l6 3-6 3z"/></svg>Log time</>
              )}
            </button>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <TaskDetailDrawer
          item={item}
          lists={allLists}
          assignees={assignees}
          pages={pages}
          workspaceId={workspaceId}
          meta={meta}
          onMetaChange={handleMetaChange}
          onRename={t => onRename(item.id, t)}
          onSetDueDate={d => onSetDueDate(item.id, d)}
          onAssign={id => onAssign(item.id, id)}
          onMoveToList={lid => onMoveToList(item.id, lid)}
          onDelete={() => onDelete(item.id)}
          onAttach={p => onAttach(item.id, p)}
          onDetach={() => onDetach(item.id)}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  )
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

interface ColumnProps {
  list: TodoList
  items: TodoItemWithPage[]
  isFirst: boolean
  isLast: boolean
  workspaceId: string
  pages: Page[]
  assignees: { id: string; email: string }[]
  allLists: TodoList[]
  onRenameList: (id: string, name: string) => void
  onMoveList: (id: string, dir: 'left' | 'right') => void
  onDeleteList: (id: string) => void
  onAddItem: (listId: string, title: string) => void
  onRenameItem: (itemId: string, title: string) => void
  onSetDueDate: (itemId: string, d: string | null) => void
  onAssignItem: (itemId: string, id: string | null) => void
  onMoveItemToList: (itemId: string, listId: string) => void
  onDeleteItem: (itemId: string) => void
  onAttach: (itemId: string, page: Page) => void
  onDetach: (itemId: string) => void
}

function KanbanColumn({
  list, items, isFirst, isLast, workspaceId, pages, assignees, allLists,
  onRenameList, onMoveList, onDeleteList, onAddItem,
  onRenameItem, onSetDueDate, onAssignItem, onMoveItemToList, onDeleteItem, onAttach, onDetach,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id })
  const [renaming, setRenaming]     = useState(false)
  const [nameDraft, setNameDraft]   = useState(list.name)
  const [addingItem, setAddingItem] = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const [menuOpen, setMenuOpen]     = useState(false)
  const addRef = useRef<HTMLInputElement>(null)
  const accent = columnAccent(list.name)

  useEffect(() => { if (addingItem) addRef.current?.focus() }, [addingItem])

  function commitRename() {
    const t = nameDraft.trim()
    setRenaming(false)
    if (t && t !== list.name) onRenameList(list.id, t); else setNameDraft(list.name)
  }
  function submitAdd() {
    const t = newTitle.trim()
    if (t) onAddItem(list.id, t)
    setNewTitle(''); setAddingItem(false)
  }

  return (
    <div className="group flex flex-col w-[272px] shrink-0" style={{ minHeight: 0 }}>
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl"
        style={{ background: accent.tint, borderBottom: '1px solid var(--border)', border: '1px solid var(--border)', borderBottomColor: 'transparent' }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent.dot }} aria-hidden />
        {renaming ? (
          <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameDraft(list.name); setRenaming(false) } }}
            className="flex-1 text-[13px] font-semibold bg-transparent outline-none"
            style={{ color: 'var(--foreground)' }} />
        ) : (
          <button type="button" onClick={() => setRenaming(true)}
            className="flex-1 text-[13px] font-semibold text-left truncate cursor-text hover:opacity-70 transition-opacity"
            style={{ color: 'var(--foreground)' }}>
            {list.name}
          </button>
        )}
        {/* Item count */}
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
          {items.length}
        </span>
        {/* Column options menu */}
        <div className="relative shrink-0">
          <button type="button" onClick={() => setMenuOpen(v => !v)}
            className="h-5 w-5 grid place-items-center rounded transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
            style={{ color: 'var(--muted-foreground)' }} aria-label="Column options">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <circle cx="6" cy="2" r="1" fill="currentColor"/>
              <circle cx="6" cy="6" r="1" fill="currentColor"/>
              <circle cx="6" cy="10" r="1" fill="currentColor"/>
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[50]" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 top-full mt-1 z-[51] rounded-lg py-1 min-w-[148px] shadow-lg overflow-hidden"
                style={{ background: 'var(--popover)', border: '1px solid var(--border)' }}>
                {[
                  { label: 'Move left', disabled: isFirst, icon: <path d="M8 2.5L4 6l4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>, action: () => onMoveList(list.id, 'left') },
                  { label: 'Move right', disabled: isLast, icon: <path d="M4 2.5L8 6l-4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>, action: () => onMoveList(list.id, 'right') },
                ].map(({ label, disabled, icon, action }) => (
                  <button key={label} type="button" disabled={disabled}
                    onClick={() => { action(); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--accent)] transition-colors disabled:opacity-30 flex items-center gap-2 cursor-pointer"
                    style={{ color: 'var(--foreground)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">{icon}</svg>
                    {label}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
                <button type="button" onClick={() => { onDeleteList(list.id); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--accent)] transition-colors flex items-center gap-2 cursor-pointer"
                  style={{ color: 'oklch(0.57 0.24 27)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Delete column
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cards drop zone */}
      <div ref={setNodeRef}
        className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto sidebar-scroll rounded-b-xl transition-colors"
        style={{
          background: isOver ? 'oklch(0.52 0.22 240 / 7%)' : 'oklch(0 0 0 / 2%)',
          border: '1px solid var(--border)',
          borderTop: 'none',
          minHeight: 100,
          outline: isOver ? '2px solid oklch(0.52 0.22 240 / 35%)' : 'none',
          outlineOffset: '-2px',
        }}>
        {items.map(item => (
          <KanbanCard key={item.id} item={item} workspaceId={workspaceId}
            pages={pages} allLists={allLists} assignees={assignees}
            onRename={onRenameItem} onSetDueDate={onSetDueDate} onAssign={onAssignItem}
            onMoveToList={onMoveItemToList} onDelete={onDeleteItem}
            onAttach={onAttach} onDetach={onDetach} />
        ))}

        {/* Add task */}
        {addingItem ? (
          <div className="rounded-lg p-2.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <input ref={addRef} value={newTitle} onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') { setNewTitle(''); setAddingItem(false) } }}
              placeholder="Task title…" aria-label={`New task in ${list.name}`}
              className="w-full text-[13px] bg-transparent outline-none mb-2.5"
              style={{ color: 'var(--foreground)' }} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={submitAdd}
                className="h-7 px-3 text-[12px] font-semibold rounded-md cursor-pointer"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                Add task
              </button>
              <button type="button" onClick={() => { setNewTitle(''); setAddingItem(false) }}
                className="h-7 px-2 text-[12px] rounded-md cursor-pointer transition-colors hover:bg-[var(--accent)]"
                style={{ color: 'var(--muted-foreground)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAddingItem(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[12px] rounded-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer hover:bg-[var(--accent)]"
            style={{ color: 'var(--muted-foreground)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
              <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Add task
          </button>
        )}
      </div>
    </div>
  )
}

// ─── KanbanView (main) ────────────────────────────────────────────────────────

interface KanbanViewProps {
  databaseId: string
  workspaceId: string
  board: TodoBoard
  pages: Page[]
  onBoardChange: (update: TodoBoard | ((prev: TodoBoard) => TodoBoard)) => void
}

export function KanbanView({ databaseId, workspaceId, board, pages, onBoardChange }: KanbanViewProps) {
  const [, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)
  const [addingList, setAddingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const addListRef = useRef<HTMLInputElement>(null)
  const assignees = board.assignees ?? []

  useEffect(() => { if (addingList) addListRef.current?.focus() }, [addingList])

  const sortedLists = [...board.lists].sort((a, b) => a.position - b.position)
  const itemsForList = useCallback((id: string) => board.items.filter(i => i.list_id === id), [board.items])

  // ── List handlers ─────────────────────────────────────────────────────────

  function handleAddList() {
    const name = newListName.trim()
    if (!name) { setAddingList(false); return }
    startTransition(async () => {
      try {
        const list = await createTodoList(databaseId, workspaceId, name)
        onBoardChange(prev => ({ ...prev, lists: [...prev.lists, list] }))
        setNewListName(''); setAddingList(false); setError(null)
      } catch { setError('Failed to create column') }
    })
  }

  function handleRenameList(listId: string, name: string) {
    const orig = board.lists.find(l => l.id === listId)?.name
    onBoardChange(prev => ({ ...prev, lists: prev.lists.map(l => l.id === listId ? { ...l, name } : l) }))
    startTransition(async () => {
      try { await renameTodoList(listId, databaseId, workspaceId, name); setError(null) }
      catch { onBoardChange(prev => ({ ...prev, lists: prev.lists.map(l => l.id === listId ? { ...l, name: orig ?? l.name } : l) })); setError('Failed to rename column') }
    })
  }

  function handleMoveList(listId: string, dir: 'left' | 'right') {
    const idx    = sortedLists.findIndex(l => l.id === listId)
    const swapIdx = dir === 'left' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= sortedLists.length) return
    const a = sortedLists[idx]; const b = sortedLists[swapIdx]
    onBoardChange(prev => ({
      ...prev,
      lists: prev.lists.map(l => l.id === a.id ? { ...l, position: b.position } : l.id === b.id ? { ...l, position: a.position } : l),
    }))
    startTransition(async () => {
      try { await reorderTodoList(listId, databaseId, workspaceId, dir); setError(null) }
      catch {
        onBoardChange(prev => ({
          ...prev,
          lists: prev.lists.map(l => l.id === a.id ? { ...l, position: a.position } : l.id === b.id ? { ...l, position: b.position } : l),
        }))
        setError('Failed to move column')
      }
    })
  }

  function handleDeleteList(listId: string) {
    const deleted = board.lists.find(l => l.id === listId)
    const deletedItems = board.items.filter(i => i.list_id === listId)
    onBoardChange(prev => ({ ...prev, lists: prev.lists.filter(l => l.id !== listId), items: prev.items.filter(i => i.list_id !== listId) }))
    startTransition(async () => {
      try { await deleteTodoList(listId, databaseId, workspaceId); setError(null) }
      catch {
        if (deleted) onBoardChange(prev => ({ ...prev, lists: [...prev.lists, deleted], items: [...prev.items, ...deletedItems] }))
        setError('Failed to delete column')
      }
    })
  }

  // ── Item handlers ─────────────────────────────────────────────────────────

  function handleAddItem(listId: string, title: string) {
    startTransition(async () => {
      try {
        const item = await createTodoItem(listId, databaseId, workspaceId, title)
        onBoardChange(prev => ({ ...prev, items: [...prev.items, item] })); setError(null)
      } catch { setError('Failed to create task') }
    })
  }

  function handleRenameItem(itemId: string, title: string) {
    const orig = board.items.find(i => i.id === itemId)?.title
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, title } : i) }))
    startTransition(async () => {
      try { await updateTodoItem(itemId, databaseId, workspaceId, { title }); setError(null) }
      catch { onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, title: orig ?? i.title } : i) })); setError('Failed to rename task') }
    })
  }

  function handleSetDueDate(itemId: string, due_date: string | null) {
    const orig = board.items.find(i => i.id === itemId)?.due_date ?? null
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, due_date } : i) }))
    startTransition(async () => {
      try { await updateTodoItem(itemId, databaseId, workspaceId, { due_date }); setError(null) }
      catch { onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, due_date: orig } : i) })); setError('Failed to update due date') }
    })
  }

  function handleAssignItem(itemId: string, assignee_id: string | null) {
    const orig = board.items.find(i => i.id === itemId)?.assignee_id ?? null
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, assignee_id } : i) }))
    startTransition(async () => {
      try { await updateTodoItem(itemId, databaseId, workspaceId, { assignee_id }); setError(null) }
      catch { onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, assignee_id: orig } : i) })); setError('Failed to assign task') }
    })
  }

  function handleMoveItemToList(itemId: string, list_id: string) {
    const orig = board.items.find(i => i.id === itemId)?.list_id
    if (!board.lists.some(l => l.id === list_id)) return
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, list_id } : i) }))
    startTransition(async () => {
      try { await updateTodoItem(itemId, databaseId, workspaceId, { list_id }); setError(null) }
      catch { onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, list_id: orig ?? i.list_id } : i) })); setError('Failed to move task') }
    })
  }

  function handleDeleteItem(itemId: string) {
    const idx = board.items.findIndex(i => i.id === itemId)
    const deleted = board.items[idx]
    onBoardChange(prev => ({ ...prev, items: prev.items.filter(i => i.id !== itemId) }))
    startTransition(async () => {
      try { await deleteTodoItem(itemId, databaseId, workspaceId); setError(null) }
      catch {
        if (deleted) onBoardChange(prev => { const next = [...prev.items]; next.splice(Math.min(idx, next.length), 0, deleted); return { ...prev, items: next } })
        setError('Failed to delete task')
      }
    })
  }

  function handleAttach(itemId: string, page: Page) {
    const orig = board.items.find(i => i.id === itemId)
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_id: page.id, attached_page_title: page.title } : i) }))
    startTransition(async () => {
      try {
        const { title } = await attachPageToTodoItem(itemId, databaseId, workspaceId, page.id)
        onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_title: title } : i) })); setError(null)
      } catch {
        onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_id: orig?.attached_page_id ?? null, attached_page_title: orig?.attached_page_title ?? null } : i) }))
        setError('Failed to attach document')
      }
    })
  }

  function handleDetach(itemId: string) {
    const orig = board.items.find(i => i.id === itemId)
    onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_id: null, attached_page_title: null } : i) }))
    startTransition(async () => {
      try { await attachPageToTodoItem(itemId, databaseId, workspaceId, null); setError(null) }
      catch {
        onBoardChange(prev => ({ ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, attached_page_id: orig?.attached_page_id ?? null, attached_page_title: orig?.attached_page_title ?? null } : i) }))
        setError('Failed to remove document')
      }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const item = board.items.find(i => i.id === String(active.id))
    if (!item) return
    const targetListId = String(over.id)
    if (item.list_id === targetListId) return
    if (!board.lists.some(l => l.id === targetListId)) return
    handleMoveItemToList(item.id, targetListId)
  }

  // ─── Board stats ───────────────────────────────────────────────────────────
  const totalItems = board.items.length
  const assigneeCount = new Set(board.items.map(i => i.assignee_id).filter(Boolean)).size

  return (
    <div className="flex flex-col h-full">
      {/* Board top bar */}
      <div className="flex items-center gap-4 px-6 py-3 shrink-0 border-b border-[var(--border)]"
        style={{ background: 'var(--background)' }}>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-mono" style={{ color: 'var(--muted-foreground)', opacity: 0.55 }}>
            {totalItems} task{totalItems !== 1 ? 's' : ''}
          </span>
          {assigneeCount > 0 && (
            <span className="text-[12px] font-mono" style={{ color: 'var(--muted-foreground)', opacity: 0.55 }}>
              · {assigneeCount} assignee{assigneeCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex-1" />
        {error && (
          <span className="text-[12px] text-destructive flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 3.5v3M6 8.5v.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {error}
          </span>
        )}
      </div>

      {/* Board */}
      <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-5 h-full overflow-x-auto overflow-y-hidden items-start">
          {sortedLists.map((list, idx) => (
            <KanbanColumn
              key={list.id}
              list={list}
              items={itemsForList(list.id)}
              isFirst={idx === 0}
              isLast={idx === sortedLists.length - 1}
              workspaceId={workspaceId}
              pages={pages}
              assignees={assignees}
              allLists={sortedLists}
              onRenameList={handleRenameList}
              onMoveList={handleMoveList}
              onDeleteList={handleDeleteList}
              onAddItem={handleAddItem}
              onRenameItem={handleRenameItem}
              onSetDueDate={handleSetDueDate}
              onAssignItem={handleAssignItem}
              onMoveItemToList={handleMoveItemToList}
              onDeleteItem={handleDeleteItem}
              onAttach={handleAttach}
              onDetach={handleDetach}
            />
          ))}

          {/* Add column */}
          {addingList ? (
            <div className="w-[272px] shrink-0 rounded-xl p-3"
              style={{ background: 'oklch(0 0 0 / 2%)', border: '1px solid var(--border)' }}>
              <input ref={addListRef} value={newListName} onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddList(); if (e.key === 'Escape') { setNewListName(''); setAddingList(false) } }}
                placeholder="Column name…"
                className="w-full text-[13px] font-medium bg-transparent outline-none mb-2.5"
                style={{ color: 'var(--foreground)' }} aria-label="New column name" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleAddList}
                  className="h-7 px-3 text-[12px] font-semibold rounded-md cursor-pointer"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  Add column
                </button>
                <button type="button" onClick={() => { setNewListName(''); setAddingList(false) }}
                  className="h-7 px-2 text-[12px] rounded-md cursor-pointer hover:bg-[var(--accent)] transition-colors"
                  style={{ color: 'var(--muted-foreground)' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingList(true)}
              className="flex items-center gap-2 h-9 px-4 text-[12.5px] font-medium rounded-xl shrink-0 transition-colors cursor-pointer hover:bg-[var(--accent)]"
              style={{ color: 'var(--muted-foreground)', border: '1px dashed var(--border)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Add column
            </button>
          )}
        </div>
      </DndContext>
    </div>
  )
}
