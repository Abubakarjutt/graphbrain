# Test Coverage Hardening — Design Spec

**Date:** 2026-08-28
**Branch:** `desktop-app`
**Status:** Approved by user, ready for planning

## Goal

Raise test coverage across the graphbrain codebase — unit/integration (Vitest) and
end-to-end (Playwright) — so that logic bugs like the ones found during this
session's manual acceptance testing (silent RPC error drops, an auth-flow
assumption that broke signup against a real backend) are caught by the test
suite instead of by a human clicking through the app.

This is a **test-only** initiative. Tests that expose a genuine production bug
do not fix it — they document it (see "Bug report artifact" below) and the fix
happens in a separate, later pass.

## Baseline (measured 2026-08-28, `npx vitest run --coverage`)

Overall: 77.0% statements / 67.2% branches / 74.8% functions / 80.75% lines,
635 tests across 65 files (all passing). Full per-file breakdown was captured
in the coverage run; the files named in the tiers below are the ones below
target.

## Scope Tiers

**Tier A — 100% branch coverage target.** Business logic and data-access
code, where a missed branch is a real, user-visible bug (as demonstrated live
this session by `workspaces.ts`'s auth-session assumption).

- `src/lib/actions/workspaces.ts` (baseline 46.66% branch)
- `src/lib/actions/pages.ts` (42.1% branch)
- `src/lib/actions/files.ts` (49.23% branch)
- `src/lib/actions/databases.ts` (61.95% branch)
- `src/lib/actions/todos.ts` (68.46% branch)
- `src/lib/actions/query.ts` (81.81% branch)
- `src/lib/graph/query.ts` (31.86% branch)
- `src/lib/graph/graph.ts` (88.88% branch)
- `src/lib/graph/ollama.ts` (68% branch)
- `src/app/api/query/ask/route.ts` (60% branch)

Every exported function in these files gets at minimum: one happy-path test,
one "no authenticated user" test (where applicable), one "RPC/query returns
an error" test, and one empty-result-set test. Errors currently swallowed
silently (found in `getTodoBoard`, `getTimeReport` per the desktop-app SDD
ledger) get a test that asserts today's actual behavior and a bug-report
entry — not a fix.

**Tier B — ~95%+, no percentage-chasing.** Components and hooks with real
conditional logic, where most branches are worth covering but a few
untestable defensive guards are acceptable to leave.

- `src/components/database/TimeReportView.tsx` (baseline 3.12% — effectively
  untested)
- `src/components/database/KanbanView.tsx` (56.2% branch)
- `src/components/database/TableView.tsx` (87.5% branch)
- `src/components/editor/BlockEditor.tsx` (46.66% branch)
- `src/components/editor/PageEditor.tsx` (65.85% branch)
- `src/components/layout/Sidebar.tsx` (69.04% branch, 30% functions)
- `src/components/query/CmdKModal.tsx` (79.59% branch)
- `src/components/query/AskPageClient.tsx` (89.74% branch)
- `src/components/auth/SignupForm.tsx` (92.18% branch — close, finish it)
- `electron/findFreePort.ts` (75% branch)
- `electron/main.ts` (has no dedicated unit test file today — only exercised
  indirectly; add one)

**Tier C — smoke-test only, explicitly not chasing 100%.** Decorative or
pure-configuration code where forcing full coverage produces brittle,
low-value tests.

- `src/components/auth/ConstellationField.tsx` (canvas animation — one
  smoke-test confirming it mounts/unmounts without throwing is enough)
- `src/components/editor/extensions/slash-items.ts` (static menu config —
  one test confirming the list shape/required fields is enough)
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` (thin factory
  wrappers — one test each confirming they construct a client is enough)

## New End-to-End Coverage (Playwright)

The existing `e2e/*.spec.ts` files cover auth (login/signup rendering),
editor, databases (table/kanban/calendar), pages, and files. Zero e2e
coverage exists today for the flow that broke live during manual testing:
signup → workspace creation → invite → accept → assignee rendering. New
spec files, following the existing `e2e/` structure and fixtures:

- `e2e/workspaces.spec.ts` — organization-creation step of the signup
  wizard (step 2), including the "no org name entered" validation path.
- `e2e/invites.spec.ts` — send an invite, copy the generated link, accept
  it as a new session, confirm the new member appears in the workspace.
- `e2e/todos.spec.ts` — create a todo, assign it to a workspace member,
  confirm the assignee's email renders on the card; time-entry creation on
  the Time view.
- `e2e/query.spec.ts` — Cmd+K search returns results and navigates; Ask
  page submits a question and renders an answer (mocked Ollama response,
  consistent with how other e2e specs mock external services).

## Bug Report Artifact

Real bugs surfaced while writing tests (not flaky-test issues) are recorded
in `docs/testing-report-2026-08-28.md`, one entry per bug:

```markdown
### <file>:<line> — <one-line summary>

**Found by:** <test file>::<test name>
**Behavior:** <what the code currently does>
**Expected:** <what it should do>
**Severity:** <blocking / important / minor>
```

The test itself asserts *today's actual* behavior (so the suite stays green)
and carries a `// BUG: see docs/testing-report-2026-08-28.md` comment
pointing at its entry — it does not use `test.fixme`/`.skip`, since the goal
is visibility into current behavior, not a disabled test. No production code
in `src/`, `electron/`, or `supabase/` changes as part of this plan.

## Task Ordering (for the implementation plan)

Riskiest-first, matching the tiers above:

1. `lib/actions/workspaces.ts` + `lib/graph/query.ts` (the two areas directly
   implicated in this session's live bugs)
2. Remaining Tier A: `lib/actions/pages.ts`, `files.ts`, `databases.ts`,
   `todos.ts`, `query.ts`, `lib/graph/graph.ts`, `ollama.ts`,
   `app/api/query/ask/route.ts`
3. Tier B editor components: `BlockEditor.tsx`, `PageEditor.tsx`
4. Tier B database view components: `TimeReportView.tsx`, `KanbanView.tsx`
5. Tier B layout/query components: `Sidebar.tsx`, `CmdKModal.tsx`,
   `AskPageClient.tsx`, `SignupForm.tsx` finish-up, `electron/main.ts`,
   `electron/findFreePort.ts` finish-up
6. New e2e specs: `workspaces.spec.ts`, `invites.spec.ts`, `todos.spec.ts`,
   `query.spec.ts`
7. Tier C smoke tests: `ConstellationField.tsx`, `slash-items.ts`,
   `lib/supabase/client.ts`/`server.ts`

## Process

- Continue on the `desktop-app` branch (the Electron code under test only
  exists there; merging to `main` still waits on this work plus Task 14 of
  the macOS desktop app plan, per earlier discussion).
- New, separate SDD ledger workspace for this plan (distinct from the
  macOS-desktop-app plan's ledger) — a different initiative, own task
  sequence.
- Executed via `subagent-driven-development`, same as the desktop app plan:
  fresh implementer per task, task review after each, final whole-branch
  review at the end (covering this work together with the desktop-app
  plan's remaining Task 14 closure).
- Follow existing test patterns exactly: Vitest + Testing Library for
  unit/integration (see `src/__tests__/lib/actions/workspaces.test.ts` for
  the established `vi.mock('@/lib/supabase/server', ...)` /
  `mockGetUser`/`mockRpc`/`mockFrom` pattern), Playwright for e2e (see
  `e2e/auth.spec.ts` for fixture/mocking conventions).

## Out of Scope

- Fixing any bug a new test uncovers (separate follow-up plan, driven by
  `docs/testing-report-2026-08-28.md`).
- Visual/pixel-level regression testing.
- Load/performance testing.
- Achieving 100% coverage on Tier C files — smoke tests only, by design.

## Success Criteria

- `npx vitest run --coverage`: Tier A files at 100% branch coverage: Tier B
  files at ≥95% branch coverage (or an explicitly documented, reviewed
  exception per uncovered branch); Tier C files have at least one passing
  smoke test each.
- Four new e2e spec files added and passing, covering the workspace/invite/
  todo-assignee/query flows.
- `docs/testing-report-2026-08-28.md` exists and lists every bug found
  during this work, each traceable to the test that found it.
- `npm test` and `npm run test:e2e` both fully green at the end.
