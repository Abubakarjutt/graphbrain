# Test Coverage Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise Vitest and Playwright coverage across graphbrain so silent-failure and edge-case bugs (like the ones found during this session's manual acceptance testing) are caught by the test suite instead of a human clicking through the app — without fixing any bug a new test uncovers.

**Architecture:** Work file-by-file, riskiest-first. Each Tier A task adds targeted gap-fill tests to an existing test file (all ten Tier A files already have partial coverage — none need a from-scratch suite). Tier B tasks gap-fill existing component suites except `TimeReportView.tsx` and `electron/main.ts`, which get new test files. New Playwright specs cover the workspace/invite/todo/query flows that have zero e2e coverage today. Tier C files get one smoke test each. Every genuine bug a test exposes gets a `// BUG:` comment plus an entry in `docs/testing-report-2026-08-28.md` — never a production-code fix.

**Tech Stack:** Vitest + `@testing-library/react` (unit/integration), Playwright (e2e), existing Supabase-mock patterns (see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-08-28-test-coverage-hardening-design.md`

## Global Constraints

- Test-only initiative: **no production code changes** in `src/`, `electron/`, or `supabase/` in this plan. Only test files and `docs/testing-report-2026-08-28.md` are created/modified.
- Tier A files (`lib/actions/workspaces.ts`, `pages.ts`, `files.ts`, `databases.ts`, `todos.ts`, `query.ts`, `lib/graph/query.ts`, `graph.ts`, `ollama.ts`, `app/api/query/ask/route.ts`) target 100% branch coverage.
- Tier B files target ~95%+ branch coverage — do not chase the last few percent on genuinely untestable defensive guards.
- Tier C files (`ConstellationField.tsx`, `slash-items.ts`, `lib/supabase/client.ts`/`server.ts`) get smoke tests only.
- When a test exposes real buggy behavior, assert *today's actual* behavior (not the fixed behavior), add a `// BUG: see docs/testing-report-2026-08-28.md` comment directly above the assertion, and append an entry to `docs/testing-report-2026-08-28.md` using the template below. Never use `test.fixme`/`.skip` for this.
- Bug report entry template:
  ```markdown
  ### <file>:<line> — <one-line summary>

  **Found by:** <test file>::<test name>
  **Behavior:** <what the code currently does>
  **Expected:** <what it should do>
  **Severity:** <blocking / important / minor>
  ```
- Mocking patterns (use whichever the target test file already uses — do not switch patterns mid-file):
  - **Pattern A** (thenable per-table builder): a `builderFor(table)` returns a chainable object whose methods (`select`, `insert`, `update`, `delete`, `eq`, `order`, `limit`, `in`, `single`, `gte`, `lt`) all return the same builder, and the builder has `then(resolve)` resolving to whatever the per-table `resolver` mock currently returns. Combined with `queueOnce(table, value)` → `resolvers[table].mockReturnValueOnce(value)`.
  - **Pattern B** (per-chain-step named mocks): each distinct chain shape gets its own named `vi.fn()`, composed via `mockImplementation` in `beforeEach`, dispatched via `mockFrom = vi.fn((table) => { switch(table) {...} })`.
  - **Pattern C** (direct `vi.mock` + `as Mock`): `vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))` then `;(createClient as Mock).mockResolvedValue({...})`.
  - All action test files mock `next/cache`: `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))`.
  - Files using Next's `after()` mock `next/server`: `vi.mock('next/server', () => ({ after: vi.fn() }))`, then invoke captured callbacks with `for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()`.
- Run `npm test -- <path>` (Vitest) to verify each task before committing; run the full `npm test` and `npm run test:e2e` at the very end (Success Criteria).
- Commit after each task with a `test:` prefixed message.

---

## Task 1: Create the bug report artifact

**Files:**
- Create: `docs/testing-report-2026-08-28.md`

**Interfaces:**
- Produces: the shared bug-report file every later task appends entries to, using the template in Global Constraints.

- [ ] **Step 1: Write the file**

```markdown
# Testing Report — 2026-08-28

Bugs discovered while hardening test coverage per
`docs/superpowers/specs/2026-08-28-test-coverage-hardening-design.md`. Each
entry's test asserts today's actual (buggy) behavior — the suite stays
green — and the fix is deferred to a separate follow-up pass.
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing-report-2026-08-28.md
git commit -m "test: scaffold bug-report artifact for coverage hardening"
```

---

## Task 2: `lib/actions/workspaces.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/actions/workspaces.test.ts`
- Modify: `docs/testing-report-2026-08-28.md`

**Interfaces:**
- Consumes: `createWorkspace(name: string): Promise<{id,name}>`, `sendInvite(workspaceId, email, role?): Promise<{token}>`, `acceptInvite(token): Promise<{workspaceId}>`, `revokeInvite(inviteId, workspaceId): Promise<void>`, `removeMember(workspaceId, userId): Promise<void>`, `getWorkspaceDetails(workspaceId): Promise<{workspace, members, invites}>` — all from `@/lib/actions/workspaces`. The file's `builderFor`/`queueOnce`/`resolvers` helpers (defined at module scope in the test file, reused across `describe` blocks).
- Produces: nothing consumed by later tasks (workspaces.ts is a leaf for this plan).

The existing `builderFor` helper only wires up `select`/`eq`/`order`/`single`/`then`. `createWorkspace`/`sendInvite`/`revokeInvite`/`removeMember` also call `.insert()` and `.delete()`, so extend the builder with those two methods (both just `vi.fn(() => builder)`, matching the existing chain-returns-builder shape) before adding the new tests below.

- [ ] **Step 1: Extend the shared builder with `insert`/`delete`**

In `src/__tests__/lib/actions/workspaces.test.ts`, inside `makeTableResolvers()`, add `insert` and `delete` to the `builder` object:

```typescript
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => builder),
      then: (resolve: (v: unknown) => void) => resolve(resolver()),
    }
```

- [ ] **Step 2: Write the failing tests — `createWorkspace`**

Add a new `describe` block:

```typescript
describe('createWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { createWorkspace } = await import('@/lib/actions/workspaces')
    await expect(createWorkspace('Acme')).rejects.toThrow('Unauthenticated')
  })

  it('creates the workspace and an owner membership row, trimming the name', async () => {
    queueOnce('workspaces', { data: { id: 'ws-1', name: 'Acme' }, error: null })
    queueOnce('workspace_members', { data: null, error: null })
    const { createWorkspace } = await import('@/lib/actions/workspaces')

    const result = await createWorkspace('  Acme  ')

    expect(result).toEqual({ id: 'ws-1', name: 'Acme' })
  })

  it('throws the database error message when the workspace insert fails', async () => {
    queueOnce('workspaces', { data: null, error: { message: 'duplicate key' } })
    const { createWorkspace } = await import('@/lib/actions/workspaces')
    await expect(createWorkspace('Acme')).rejects.toThrow('duplicate key')
  })

  it('falls back to a generic message when the insert fails with no error message', async () => {
    queueOnce('workspaces', { data: null, error: null })
    const { createWorkspace } = await import('@/lib/actions/workspaces')
    await expect(createWorkspace('Acme')).rejects.toThrow('Failed to create workspace')
  })
})
```

- [ ] **Step 3: Write the failing tests — `sendInvite`**

```typescript
describe('sendInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { sendInvite } = await import('@/lib/actions/workspaces')
    await expect(sendInvite('ws-1', 'a@b.com')).rejects.toThrow('Unauthenticated')
  })

  it('inserts an invite and returns its token, lowercasing/trimming the email, defaulting role to editor', async () => {
    queueOnce('workspace_invites', { data: { token: 'tok-123' }, error: null })
    const { sendInvite } = await import('@/lib/actions/workspaces')

    const result = await sendInvite('ws-1', '  A@Example.com  ')

    expect(result).toEqual({ token: 'tok-123' })
  })

  it('surfaces a friendly message for a duplicate invite (unique constraint violation)', async () => {
    queueOnce('workspace_invites', { data: null, error: { code: '23505', message: 'duplicate key value' } })
    const { sendInvite } = await import('@/lib/actions/workspaces')
    await expect(sendInvite('ws-1', 'a@b.com')).rejects.toThrow('a@b.com has already been invited.')
  })

  it('surfaces the generic database error message for any other failure', async () => {
    queueOnce('workspace_invites', { data: null, error: { code: '42501', message: 'permission denied' } })
    const { sendInvite } = await import('@/lib/actions/workspaces')
    await expect(sendInvite('ws-1', 'a@b.com')).rejects.toThrow('permission denied')
  })
})
```

- [ ] **Step 4: Write the failing test — `acceptInvite` generic-error branch**

Add to the existing `describe('acceptInvite', ...)` block:

```typescript
  it('surfaces the generic error message for any other RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'something else broke' } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('something else broke')
  })
```

- [ ] **Step 5: Write the failing tests — `revokeInvite` (documents a real bug: no auth check, no error surfacing)**

```typescript
describe('revokeInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('deletes the invite scoped to both its id and the workspace', async () => {
    const deleteSpy = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      const builder = builderFor(table)
      const originalDelete = builder.delete as ReturnType<typeof vi.fn>
      builder.delete = vi.fn((...args: unknown[]) => { deleteSpy(...args); return originalDelete(...args) })
      return builder
    })
    queueOnce('workspace_invites', { data: null, error: null })
    const { revokeInvite } = await import('@/lib/actions/workspaces')

    await revokeInvite('invite-1', 'ws-1')

    expect(deleteSpy).toHaveBeenCalled()
  })

  // BUG: see docs/testing-report-2026-08-28.md
  it('does not check whether the signed-in user is authenticated at all', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    queueOnce('workspace_invites', { data: null, error: null })
    const { revokeInvite } = await import('@/lib/actions/workspaces')

    await expect(revokeInvite('invite-1', 'ws-1')).resolves.toBeUndefined()
  })

  // BUG: see docs/testing-report-2026-08-28.md
  it('silently resolves even when the delete itself errors, giving the caller no feedback', async () => {
    queueOnce('workspace_invites', { data: null, error: { message: 'permission denied' } })
    const { revokeInvite } = await import('@/lib/actions/workspaces')

    await expect(revokeInvite('invite-1', 'ws-1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 6: Write the failing tests — `removeMember`**

```typescript
describe('removeMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { removeMember } = await import('@/lib/actions/workspaces')
    await expect(removeMember('ws-1', 'u2')).rejects.toThrow('Unauthenticated')
  })

  it('throws when the signed-in user tries to remove themselves', async () => {
    const { removeMember } = await import('@/lib/actions/workspaces')
    await expect(removeMember('ws-1', 'u1')).rejects.toThrow('You cannot remove yourself.')
  })

  it('deletes the membership row for another user and revalidates', async () => {
    queueOnce('workspace_members', { data: null, error: null })
    const { removeMember } = await import('@/lib/actions/workspaces')
    await expect(removeMember('ws-1', 'u2')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 7: Write the failing test — `getWorkspaceDetails` unauthenticated branch and the RPC-error bug**

Add to the existing `describe('getWorkspaceDetails', ...)` block:

```typescript
  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    await expect(getWorkspaceDetails('ws-1')).rejects.toThrow('Unauthenticated')
  })

  // BUG: see docs/testing-report-2026-08-28.md
  it('silently blanks every member email when the email-lookup RPC errors, instead of surfacing the error', async () => {
    queueOnce('workspaces', { data: { id: 'ws-1', name: 'Acme', owner_id: 'u1' }, error: null })
    queueOnce('workspace_members', { data: [{ user_id: 'u1', role: 'owner' }], error: null })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })
    queueOnce('workspace_invites', { data: [], error: null })

    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    const result = await getWorkspaceDetails('ws-1')

    expect(result.members).toEqual([{ user_id: 'u1', role: 'owner', email: '' }])
  })
```

- [ ] **Step 8: Run the tests**

Run: `npm test -- src/__tests__/lib/actions/workspaces.test.ts`
Expected: all pass.

- [ ] **Step 9: Append the two bug-report entries**

Add to `docs/testing-report-2026-08-28.md`:

```markdown
### src/lib/actions/workspaces.ts:119-122 — revokeInvite has no auth check and swallows delete errors

**Found by:** src/__tests__/lib/actions/workspaces.test.ts::revokeInvite > does not check whether the signed-in user is authenticated at all / silently resolves even when the delete itself errors, giving the caller no feedback
**Behavior:** `revokeInvite` calls `supabase.auth.getUser()` nowhere, and does not check the `error` returned from the `.delete()` call — it relies entirely on RLS to reject unauthorized deletes, and the caller receives no indication whether the delete actually happened.
**Expected:** Throw `'Unauthenticated'` when there is no signed-in user (matching every sibling function in this file), and throw the database error message when the delete fails.
**Severity:** important

### src/lib/actions/workspaces.ts:101 — getWorkspaceDetails silently blanks all member emails on RPC failure

**Found by:** src/__tests__/lib/actions/workspaces.test.ts::getWorkspaceDetails > silently blanks every member email when the email-lookup RPC errors, instead of surfacing the error
**Behavior:** `const { data: emailRowsData } = await supabase.rpc('get_workspace_member_emails', ...)` destructures without checking `error`; when the RPC fails, `emailRowsData` is `null`, `emailRows` becomes `[]`, and every member is rendered with `email: ''` with no indication anything went wrong.
**Expected:** Check the RPC's `error` and either throw or otherwise surface the failure instead of silently rendering blank emails for the whole membership list.
**Severity:** important
```

- [ ] **Step 10: Commit**

```bash
git add src/__tests__/lib/actions/workspaces.test.ts docs/testing-report-2026-08-28.md
git commit -m "test: gap-fill workspaces.ts coverage, document two silent-failure bugs"
```

---

## Task 3: `lib/graph/query.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/graph/query.test.ts`
- Modify: `docs/testing-report-2026-08-28.md`

**Interfaces:**
- Consumes: `retrieveNodes(supabase, embed, workspaceId, query, scope?)` and the module-level `fetchContentBatch` (not exported — exercised only indirectly through `retrieveNodes`) from `@/lib/graph/query`. Existing test file's `vi.mock('@/lib/graph/ollama', ...)`/`vi.mock('@/lib/supabase/server', ...)` (Pattern C) — read the current mock setup at the top of the file before adding tests and reuse its `mockFrom`/`mockRpc` shape exactly.

- [ ] **Step 1: Read the current mock scaffold**

Before writing new tests, re-read `src/__tests__/lib/graph/query.test.ts` in full so the `mockFrom` table-dispatch shape used by the 3 existing tests is matched exactly (it dispatches on table name — `nodes`, `edges`, `pages`, `blocks`, `database_rows`, `files` — via a `switch`, Pattern B/C hybrid already in that file).

- [ ] **Step 2: Write the failing test — `match_nodes` RPC error propagates**

```typescript
it('propagates an error when the match_nodes rpc itself errors', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc exploded' } })
  await expect(retrieveNodes(supabase, embed, 'ws-1', 'query text')).rejects.toThrow('rpc exploded')
})
```

- [ ] **Step 3: Write the failing test — hydrates a page node with a truncated block excerpt**

```typescript
it('hydrates a page node with an excerpt built from its first non-empty text blocks, truncated to 200 chars', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ node_id: 'node-1', score: 0.9 }], error: null })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'nodes') return tableResult([{ id: 'node-1', entity_type: 'page', entity_id: 'page-1' }])
    if (table === 'edges') return tableResult([])
    if (table === 'pages') return tableResult([{ id: 'page-1', title: 'My Page' }])
    if (table === 'blocks') return tableResult([
      { page_id: 'page-1', position: 0, content: { type: 'paragraph', content: [{ type: 'text', text: '' }] } },
      { page_id: 'page-1', position: 1, content: { type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(250) }] } },
    ])
    return tableResult([])
  })

  const result = await retrieveNodes(supabase, embed, 'ws-1', 'query text')

  expect(result[0].title).toBe('My Page')
  expect(result[0].excerpt.length).toBeLessThanOrEqual(200)
})
```

- [ ] **Step 4: Write the failing test — hydrates a database-row node with resolved project name**

```typescript
it('hydrates a database-row node with its resolved project (database) name', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ node_id: 'node-2', score: 0.8 }], error: null })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'nodes') return tableResult([{ id: 'node-2', entity_type: 'database_row', entity_id: 'row-1' }])
    if (table === 'edges') return tableResult([])
    if (table === 'database_rows') return tableResult([{ id: 'row-1', database_id: 'db-1', fields: { title: 'Row Title' } }])
    if (table === 'pages') return tableResult([{ id: 'db-page-1', title: 'Project Alpha' }])
    if (table === 'databases') return tableResult([{ id: 'db-1', page_id: 'db-page-1' }])
    return tableResult([])
  })

  const result = await retrieveNodes(supabase, embed, 'ws-1', 'query text')

  expect(result[0].projectName).toBe('Project Alpha')
  expect(result[0].projectDatabaseId).toBe('db-1')
})
```

- [ ] **Step 5: Write the failing test — file node title/excerpt derivation**

```typescript
it('derives a file node title from its storage path and excerpt from extracted text', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ node_id: 'node-3', score: 0.7 }], error: null })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'nodes') return tableResult([{ id: 'node-3', entity_type: 'file', entity_id: 'file-1' }])
    if (table === 'edges') return tableResult([])
    if (table === 'files') return tableResult([{ id: 'file-1', storage_path: 'ws-1/uploads/report.pdf', extracted_text: 'The report says X.' }])
    return tableResult([])
  })

  const result = await retrieveNodes(supabase, embed, 'ws-1', 'query text')

  expect(result[0].title).toBe('report.pdf')
  expect(result[0].excerpt).toContain('The report says X.')
})
```

- [ ] **Step 6: Write the failing test — the broken `safeS` fallback bug on an empty database-row title**

```typescript
// BUG: see docs/testing-report-2026-08-28.md
it('renders an empty string title for a database row instead of falling back to "Untitled Row"', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ node_id: 'node-4', score: 0.6 }], error: null })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'nodes') return tableResult([{ id: 'node-4', entity_type: 'database_row', entity_id: 'row-2' }])
    if (table === 'edges') return tableResult([])
    if (table === 'database_rows') return tableResult([{ id: 'row-2', database_id: 'db-1', fields: { title: '' } }])
    if (table === 'pages') return tableResult([])
    if (table === 'databases') return tableResult([])
    return tableResult([])
  })

  const result = await retrieveNodes(supabase, embed, 'ws-1', 'query text')

  expect(result[0].title).toBe('')
})
```

- [ ] **Step 7: Write the failing test — no expansion needed when there are no edges (`newIds.length === 0` short-circuit)**

```typescript
it('does not query nodes/content a second time when 1-hop expansion finds no new ids', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ node_id: 'node-1', score: 0.9 }], error: null })
  const nodesFrom = vi.fn(() => tableResult([{ id: 'node-1', entity_type: 'page', entity_id: 'page-1' }]))
  mockFrom.mockImplementation((table: string) => {
    if (table === 'nodes') return nodesFrom()
    if (table === 'edges') return tableResult([])
    if (table === 'pages') return tableResult([{ id: 'page-1', title: 'My Page' }])
    return tableResult([])
  })

  await retrieveNodes(supabase, embed, 'ws-1', 'query text')

  expect(nodesFrom).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 8: Write the failing test — skips the edges query entirely when no top-scored id is a valid UUID**

```typescript
it('skips the edge-expansion query when no scored node id is a valid UUID', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ node_id: 'not-a-uuid', score: 0.9 }], error: null })
  const edgesFrom = vi.fn(() => tableResult([]))
  mockFrom.mockImplementation((table: string) => {
    if (table === 'nodes') return tableResult([{ id: 'not-a-uuid', entity_type: 'page', entity_id: 'page-1' }])
    if (table === 'edges') return edgesFrom()
    if (table === 'pages') return tableResult([{ id: 'page-1', title: 'My Page' }])
    return tableResult([])
  })

  await retrieveNodes(supabase, embed, 'ws-1', 'query text')

  expect(edgesFrom).not.toHaveBeenCalled()
})
```

Note: use whatever `tableResult(rows)` helper the existing 3 tests already define at the top of the file (a small `{ select: ..., then: (resolve) => resolve({ data: rows, error: null }) }`-shaped stub) — do not invent a second helper.

- [ ] **Step 9: Run the tests**

Run: `npm test -- src/__tests__/lib/graph/query.test.ts`
Expected: all pass.

- [ ] **Step 10: Append the bug-report entry**

```markdown
### src/lib/graph/query.ts (fetchContentBatch title fallback) — broken Untitled-Row fallback

**Found by:** src/__tests__/lib/graph/query.test.ts::renders an empty string title for a database row instead of falling back to "Untitled Row"
**Behavior:** The fallback chain `safeS(fields['title']) ?? safeS(fields['name']) ?? safeS(fields['Name']) ?? 'Untitled Row'` never reaches `'Untitled Row'` because `safeS()` always returns a string (possibly `''`), never `null`/`undefined` — so `??` never triggers, and a row with an empty-string title renders as a blank title instead of "Untitled Row".
**Expected:** `safeS()`'s result should be treated as falsy for empty strings in this fallback chain (e.g. `safeS(...) || safeS(...) || ... || 'Untitled Row'`), so an empty title correctly falls through to "Untitled Row".
**Severity:** minor
```

- [ ] **Step 11: Commit**

```bash
git add src/__tests__/lib/graph/query.test.ts docs/testing-report-2026-08-28.md
git commit -m "test: gap-fill graph/query.ts fetchContentBatch coverage, document title-fallback bug"
```

---

## Task 4: `lib/actions/pages.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/actions/pages.test.ts`

**Interfaces:**
- Consumes: `getPages`, `createPage`, `updatePageTitle`, `deletePage`, `saveBlocks(pageId, workspaceId, doc, title)`, `loadBlocks(pageId, workspaceId)` from `@/lib/actions/pages`. Reuses the file's existing `vi.mock('@/lib/supabase/server', ...)` + `vi.mock('next/server', () => ({ after: vi.fn() }))` + `vi.mock('@/lib/graph/graph', ...)` scaffold (read the top of the file first — it already mocks `upsertNode`/`findNodeId`/`upsertEdge`/`scheduleEmbed`/`clearMentionEdges`/`findPageNodeByTitle` since `createPage`/`updatePageTitle`/`saveBlocks` all call into `@/lib/graph/graph`).

- [ ] **Step 1: Write the failing tests — `saveBlocks`**

```typescript
describe('saveBlocks', () => {
  it('throws "Page not found or access denied" when the page does not belong to the workspace', async () => {
    queueOnce('pages', { data: null, error: null }) // .single() on the ownership check
    const { saveBlocks } = await import('@/lib/actions/pages')
    await expect(saveBlocks('page-1', 'ws-1', { type: 'doc', content: [] }, 'Title')).rejects.toThrow('Page not found or access denied')
  })

  it('deletes old blocks and inserts nothing when the new doc has no content', async () => {
    queueOnce('pages', { data: { id: 'page-1' }, error: null })
    queueOnce('blocks', { data: null, error: null }) // delete
    const { saveBlocks } = await import('@/lib/actions/pages')
    await expect(saveBlocks('page-1', 'ws-1', { type: 'doc', content: [] }, 'Title')).resolves.toBeUndefined()
  })

  it('deletes old blocks and inserts the new ones when the doc has content', async () => {
    queueOnce('pages', { data: { id: 'page-1' }, error: null })
    queueOnce('blocks', { data: null, error: null }) // delete
    queueOnce('blocks', { data: null, error: null }) // insert
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }
    const { saveBlocks } = await import('@/lib/actions/pages')
    await expect(saveBlocks('page-1', 'ws-1', doc, 'Title')).resolves.toBeUndefined()
  })

  it('rebuilds mention edges in the background: clears old ones, resolves each mentioned title, creates mention+backlink edges, and re-embeds', async () => {
    queueOnce('pages', { data: { id: 'page-1' }, error: null })
    queueOnce('blocks', { data: null, error: null })
    queueOnce('blocks', { data: null, error: null })
    vi.mocked(findPageNodeByTitle).mockResolvedValueOnce('node-of-mentioned-page')
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See [[Other Page]] for details' }] }] }

    const { saveBlocks } = await import('@/lib/actions/pages')
    await saveBlocks('page-1', 'ws-1', doc, 'Title')

    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(clearMentionEdges).toHaveBeenCalledWith(expect.anything(), 'page-1')
    expect(findPageNodeByTitle).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'Other Page')
    expect(upsertEdge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'mention' }))
    expect(upsertEdge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'backlink' }))
  })

  it('skips creating a mention edge for a title that resolves to no node', async () => {
    queueOnce('pages', { data: { id: 'page-1' }, error: null })
    queueOnce('blocks', { data: null, error: null })
    queueOnce('blocks', { data: null, error: null })
    vi.mocked(findPageNodeByTitle).mockResolvedValueOnce(null)
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See [[Ghost Page]]' }] }] }

    const { saveBlocks } = await import('@/lib/actions/pages')
    await saveBlocks('page-1', 'ws-1', doc, 'Title')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(upsertEdge).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'mention' }))
  })
})
```

Adjust the exact `queueOnce`/mock-dispatch calls to whichever pattern (A/B/C) the file's existing `createPage`/`updatePageTitle` tests already use for the `pages`/`blocks` tables — mirror them exactly rather than introducing a new shape.

- [ ] **Step 2: Write the failing tests — `loadBlocks`**

```typescript
describe('loadBlocks', () => {
  it('throws "Page not found or access denied" when the page does not belong to the workspace', async () => {
    queueOnce('pages', { data: null, error: null })
    const { loadBlocks } = await import('@/lib/actions/pages')
    await expect(loadBlocks('page-1', 'ws-1')).rejects.toThrow('Page not found or access denied')
  })

  it('wraps ordered blocks as a Tiptap doc', async () => {
    queueOnce('pages', { data: { id: 'page-1' }, error: null })
    queueOnce('blocks', {
      data: [
        { position: 0, content: { type: 'paragraph', content: [{ type: 'text', text: 'first' }] } },
        { position: 1, content: { type: 'paragraph', content: [{ type: 'text', text: 'second' }] } },
      ],
      error: null,
    })
    const { loadBlocks } = await import('@/lib/actions/pages')
    const result = await loadBlocks('page-1', 'ws-1')
    expect(result).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
      ],
    })
  })
})
```

- [ ] **Step 3: Write the failing test — `createPage` parent-linking `after()` branch**

```typescript
it('links the new page to its parent via an edge when parentId is given', async () => {
  queueOnce('pages', { data: { id: 'page-2', title: 'Child' }, error: null })
  vi.mocked(findNodeId).mockResolvedValueOnce('parent-node-id')
  const { createPage } = await import('@/lib/actions/pages')

  await createPage('ws-1', 'parent-page-1', 'Child')
  for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

  expect(findNodeId).toHaveBeenCalledWith(expect.anything(), 'page', 'parent-page-1')
  expect(upsertEdge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toId: 'parent-node-id' }))
})

it('does not attempt to link a parent edge when no parentId is given', async () => {
  queueOnce('pages', { data: { id: 'page-2', title: 'Standalone' }, error: null })
  const { createPage } = await import('@/lib/actions/pages')

  await createPage('ws-1', null, 'Standalone')
  for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

  expect(findNodeId).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/__tests__/lib/actions/pages.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/lib/actions/pages.test.ts
git commit -m "test: gap-fill pages.ts saveBlocks/loadBlocks/createPage coverage"
```

---

## Task 5: `lib/actions/files.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/actions/files.test.ts`

**Interfaces:**
- Consumes: `retryExtraction(fileId, workspaceId)` (exported), plus the private `runExtraction`/`sanitizeExtractedText` reached only through `createFilePage`'s scheduled `after()` callback and `retryExtraction`. Reuses the existing `vi.mock('pdf-parse', ...)`/`vi.mock('mammoth', ...)` if present — if not yet mocked in this file, add `vi.mock('pdf-parse', () => ({ default: vi.fn() }))` and `vi.mock('mammoth', () => ({ extractRawText: vi.fn() }))` at the top, matching the existing `vi.mock('@/lib/parsing/pdfToMarkdown', ...)`-style mocks already used for `runDocParse`.

- [ ] **Step 1: Write the failing tests — `runExtraction` via `createFilePage`'s `after()` callback**

```typescript
describe('runExtraction (via createFilePage background job)', () => {
  it('extracts text from a PDF, sanitizes it, and writes it to the file row', async () => {
    const pdfParse = (await import('pdf-parse')).default as unknown as ReturnType<typeof vi.fn>
    vi.mocked(pdfParse).mockResolvedValueOnce({ text: 'Extracted <script>alert(1)</script> PDF text' })
    queueOnce('files', { data: { id: 'file-1', mime_type: 'application/pdf', storage_path: 'ws-1/f.pdf', extraction_status: 'pending' }, error: null })
    queueOnce('files', { data: null, error: null }) // update to 'done'

    const { createFilePage } = await import('@/lib/actions/files')
    await createFilePage('ws-1', 'page-1', 'f.pdf', 'application/pdf', 100, 'ws-1/f.pdf')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(pdfParse).toHaveBeenCalled()
  })

  it('extracts text from a DOCX file via mammoth', async () => {
    const mammoth = await import('mammoth')
    vi.mocked(mammoth.extractRawText).mockResolvedValueOnce({ value: 'Docx text', messages: [] })
    queueOnce('files', { data: { id: 'file-2', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', storage_path: 'ws-1/f.docx', extraction_status: 'pending' }, error: null })
    queueOnce('files', { data: null, error: null })

    const { createFilePage } = await import('@/lib/actions/files')
    await createFilePage('ws-1', 'page-1', 'f.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100, 'ws-1/f.docx')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(mammoth.extractRawText).toHaveBeenCalled()
  })

  it('decodes a plain-text file directly from the downloaded buffer', async () => {
    queueOnce('files', { data: { id: 'file-3', mime_type: 'text/plain', storage_path: 'ws-1/f.txt', extraction_status: 'pending' }, error: null })
    queueOnce('files', { data: null, error: null })

    const { createFilePage } = await import('@/lib/actions/files')
    await createFilePage('ws-1', 'page-1', 'f.txt', 'text/plain', 100, 'ws-1/f.txt')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    // No pdf-parse/mammoth call for plain text — falls through to buffer decode
    const pdfParse = (await import('pdf-parse')).default as unknown as ReturnType<typeof vi.fn>
    expect(pdfParse).not.toHaveBeenCalled()
  })

  it('marks extraction_status as error when the extraction call throws', async () => {
    const pdfParse = (await import('pdf-parse')).default as unknown as ReturnType<typeof vi.fn>
    vi.mocked(pdfParse).mockRejectedValueOnce(new Error('corrupt pdf'))
    queueOnce('files', { data: { id: 'file-4', mime_type: 'application/pdf', storage_path: 'ws-1/f.pdf', extraction_status: 'pending' }, error: null })
    queueOnce('files', { data: null, error: null }) // update to 'error'

    const { createFilePage } = await import('@/lib/actions/files')
    await createFilePage('ws-1', 'page-1', 'f.pdf', 'application/pdf', 100, 'ws-1/f.pdf')
    await expect((async () => {
      for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()
    })()).resolves.toBeUndefined() // runExtraction catches its own errors internally
  })

  it('still writes the graph node even when the extracted text is later used for embedding, independent of the DB write outcome', async () => {
    const pdfParse = (await import('pdf-parse')).default as unknown as ReturnType<typeof vi.fn>
    vi.mocked(pdfParse).mockResolvedValueOnce({ text: 'Some text' })
    queueOnce('files', { data: { id: 'file-5', mime_type: 'application/pdf', storage_path: 'ws-1/f.pdf', extraction_status: 'pending' }, error: null })
    queueOnce('files', { data: null, error: null })

    const { createFilePage } = await import('@/lib/actions/files')
    await createFilePage('ws-1', 'page-1', 'f.pdf', 'application/pdf', 100, 'ws-1/f.pdf')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(upsertNode).toHaveBeenCalled()
  })
})
```

Adjust the exact storage-download mock (whatever fixture the existing `runDocParse` tests use to stand in for `supabase.storage.from(...).download(...)` returning a `Blob`/`ArrayBuffer`) — reuse it verbatim for these `runExtraction` tests rather than inventing a new one.

- [ ] **Step 2: Write the failing tests — `sanitizeExtractedText` (exercised via the PDF extraction test's assertion on the persisted text)**

Extend the first test in Step 1 to assert the sanitizer stripped the script tag:

```typescript
  it('strips HTML tags and javascript: URIs from extracted text before persisting', async () => {
    const pdfParse = (await import('pdf-parse')).default as unknown as ReturnType<typeof vi.fn>
    vi.mocked(pdfParse).mockResolvedValueOnce({ text: '<a href="javascript:alert(1)">click</a> real text' })
    const updateSpy = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      const builder = builderFor(table)
      if (table === 'files') {
        const originalUpdate = builder.update as ReturnType<typeof vi.fn>
        builder.update = vi.fn((payload: unknown) => { updateSpy(payload); return originalUpdate(payload) })
      }
      return builder
    })
    queueOnce('files', { data: { id: 'file-6', mime_type: 'application/pdf', storage_path: 'ws-1/f.pdf', extraction_status: 'pending' }, error: null })
    queueOnce('files', { data: null, error: null })

    const { createFilePage } = await import('@/lib/actions/files')
    await createFilePage('ws-1', 'page-1', 'f.pdf', 'application/pdf', 100, 'ws-1/f.pdf')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      extracted_text: expect.not.stringContaining('javascript:'),
    }))
  })
```

- [ ] **Step 3: Write the failing tests — `retryExtraction`**

```typescript
describe('retryExtraction', () => {
  it('resets extraction_status to pending and re-runs extraction', async () => {
    queueOnce('files', { data: { id: 'file-1', workspace_id: 'ws-1', mime_type: 'application/pdf', storage_path: 'ws-1/f.pdf' }, error: null }) // ownership check
    queueOnce('files', { data: null, error: null }) // reset to pending
    const pdfParse = (await import('pdf-parse')).default as unknown as ReturnType<typeof vi.fn>
    vi.mocked(pdfParse).mockResolvedValueOnce({ text: 'text' })
    queueOnce('files', { data: null, error: null }) // final update to done

    const { retryExtraction } = await import('@/lib/actions/files')
    await retryExtraction('file-1', 'ws-1')
    for (const call of vi.mocked(after).mock.calls) await (call[0] as () => Promise<void>)()

    expect(pdfParse).toHaveBeenCalled()
  })

  it('throws when the file does not belong to the given workspace', async () => {
    queueOnce('files', { data: null, error: null })
    const { retryExtraction } = await import('@/lib/actions/files')
    await expect(retryExtraction('file-1', 'ws-1')).rejects.toThrow()
  })
})
```

Match the exact "not found" error message string to whatever `getFileRecord`'s existing "wrong workspace null" test in this same file expects `retryExtraction` to throw (read that test first) — do not invent a new message.

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/__tests__/lib/actions/files.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/lib/actions/files.test.ts
git commit -m "test: gap-fill files.ts runExtraction/sanitizeExtractedText/retryExtraction coverage"
```

---

## Task 6: `lib/actions/databases.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/actions/databases.test.ts`

**Interfaces:**
- Consumes: `getDatabase`, `createRow`, `updateRowFields`, `deleteRow` from `@/lib/actions/databases`.

- [ ] **Step 1: Write the failing tests — `getDatabase` non-existent-database and rows-error branches**

```typescript
it('throws when the database itself does not exist', async () => {
  queueOnce('databases', { data: null, error: null })
  const { getDatabase } = await import('@/lib/actions/databases')
  await expect(getDatabase('db-ghost', 'ws-1')).rejects.toThrow()
})

it('returns an empty rows array when the rows query errors', async () => {
  queueOnce('databases', { data: { id: 'db-1', page_id: 'page-1', schema: [] }, error: null })
  queueOnce('pages', { data: { id: 'page-1', workspace_id: 'ws-1' }, error: null })
  queueOnce('database_rows', { data: null, error: { message: 'boom' } })
  const { getDatabase } = await import('@/lib/actions/databases')
  const result = await getDatabase('db-1', 'ws-1')
  expect(result.rows).toEqual([])
})
```

Match the exact thrown-error string to whichever the file's existing "container page not in workspace" test expects (read the surrounding tests first — likely the same `'Database not found'`-shaped message) so the two "not found" tests are consistent.

- [ ] **Step 2: Write the failing tests — `createRow` wrong-workspace branch**

```typescript
it('throws when the database\'s container page is not in the given workspace', async () => {
  queueOnce('databases', { data: { id: 'db-1', page_id: 'page-1', schema: [] }, error: null })
  queueOnce('pages', { data: { id: 'page-1', workspace_id: 'other-ws' }, error: null })
  const { createRow } = await import('@/lib/actions/databases')
  await expect(createRow('db-1', 'ws-1')).rejects.toThrow()
})
```

- [ ] **Step 3: Write the failing tests — `updateRowFields` wrong-workspace branch**

```typescript
it('throws when updating a row whose database is not in the given workspace', async () => {
  queueOnce('database_rows', { data: { id: 'row-1', database_id: 'db-1' }, error: null })
  queueOnce('databases', { data: { id: 'db-1', page_id: 'page-1' }, error: null })
  queueOnce('pages', { data: { id: 'page-1', workspace_id: 'other-ws' }, error: null })
  const { updateRowFields } = await import('@/lib/actions/databases')
  await expect(updateRowFields('row-1', 'db-1', 'ws-1', { field1: 'x' })).rejects.toThrow()
})
```

- [ ] **Step 4: Write the failing test — `deleteRow` wrong-workspace branch**

```typescript
it('throws when deleting a row whose database is not in the given workspace', async () => {
  queueOnce('database_rows', { data: { id: 'row-1', database_id: 'db-1', page_id: 'page-1' }, error: null })
  queueOnce('databases', { data: { id: 'db-1', page_id: 'db-page-1' }, error: null })
  queueOnce('pages', { data: { id: 'db-page-1', workspace_id: 'other-ws' }, error: null })
  const { deleteRow } = await import('@/lib/actions/databases')
  await expect(deleteRow('row-1', 'db-1', 'ws-1')).rejects.toThrow()
})
```

Before writing Steps 2-4, re-read `getDatabase`/`createRow`/`updateRowFields`/`deleteRow` in `src/lib/actions/databases.ts` to confirm the exact sequence of table lookups each performs (row → database → page, vs. database → page directly) and match the `queueOnce` call order to that exact sequence — the order above is illustrative and must be checked against the real source before committing.

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/__tests__/lib/actions/databases.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/lib/actions/databases.test.ts
git commit -m "test: gap-fill databases.ts not-found and wrong-workspace branches"
```

---

## Task 7: `lib/actions/todos.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/actions/todos.test.ts`
- Modify: `docs/testing-report-2026-08-28.md`

**Interfaces:**
- Consumes: `saveTimeEntry(itemId, databaseId, workspaceId, durationMs)`, `updateTodoItem(itemId, databaseId, workspaceId, patch)`, `deleteTodoList`, `deleteTodoItem`, `getTodoBoard`, `getTimeReport` from `@/lib/actions/todos`.

- [ ] **Step 1: Write the failing tests — `saveTimeEntry`**

```typescript
describe('saveTimeEntry', () => {
  it('returns silently without inserting when there is no signed-in user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { saveTimeEntry } = await import('@/lib/actions/todos')
    await expect(saveTimeEntry('item-1', 'db-1', 'ws-1', 60000)).resolves.toBeUndefined()
  })

  it('inserts a time entry for the current user', async () => {
    const insertSpy = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      const builder = builderFor(table)
      if (table === 'time_entries') {
        const originalInsert = builder.insert as ReturnType<typeof vi.fn>
        builder.insert = vi.fn((payload: unknown) => { insertSpy(payload); return originalInsert(payload) })
      }
      return builder
    })
    queueOnce('time_entries', { data: null, error: null })

    const { saveTimeEntry } = await import('@/lib/actions/todos')
    await saveTimeEntry('item-1', 'db-1', 'ws-1', 60000)

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ item_id: 'item-1', duration_ms: 60000 }))
  })

  // BUG: see docs/testing-report-2026-08-28.md
  it('resolves without throwing even when the insert itself errors', async () => {
    queueOnce('time_entries', { data: null, error: { message: 'insert failed' } })
    const { saveTimeEntry } = await import('@/lib/actions/todos')
    await expect(saveTimeEntry('item-1', 'db-1', 'ws-1', 60000)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Write the failing tests — `updateTodoItem` valid list-move and error propagation**

```typescript
it('moves an item to a new list after validating the new list belongs to the same database', async () => {
  queueOnce('todo_lists', { data: { id: 'list-2', database_id: 'db-1' }, error: null })
  queueOnce('todo_items', { data: null, error: null })
  const { updateTodoItem } = await import('@/lib/actions/todos')
  await expect(updateTodoItem('item-1', 'db-1', 'ws-1', { list_id: 'list-2' })).resolves.toBeUndefined()
})

it('propagates the database error when the update itself fails', async () => {
  queueOnce('todo_items', { data: null, error: { message: 'update failed' } })
  const { updateTodoItem } = await import('@/lib/actions/todos')
  await expect(updateTodoItem('item-1', 'db-1', 'ws-1', { title: 'New title' })).rejects.toThrow('update failed')
})
```

- [ ] **Step 3: Write the failing tests — `deleteTodoList`/`deleteTodoItem` success paths**

```typescript
it('deletes a todo list', async () => {
  queueOnce('todo_lists', { data: { id: 'list-1', database_id: 'db-1' }, error: null }) // assertListBelongsToDatabase, if applicable
  queueOnce('todo_lists', { data: null, error: null }) // delete
  const { deleteTodoList } = await import('@/lib/actions/todos')
  await expect(deleteTodoList('list-1', 'db-1', 'ws-1')).resolves.toBeUndefined()
})

it('deletes a todo item', async () => {
  queueOnce('todo_items', { data: null, error: null })
  const { deleteTodoItem } = await import('@/lib/actions/todos')
  await expect(deleteTodoItem('item-1', 'db-1', 'ws-1')).resolves.toBeUndefined()
})
```

Check `assertDatabaseAccess`/`assertListBelongsToDatabase` call order in the real source for `deleteTodoList`/`deleteTodoItem` before finalizing the `queueOnce` sequence — mirror whatever order the existing error-propagation tests for these two functions already established in this file.

- [ ] **Step 4: Write the failing tests — `getTodoBoard`/`getTimeReport` RPC-error silent-drop bugs**

```typescript
// BUG: see docs/testing-report-2026-08-28.md
it('silently renders no assignees when the member-email RPC errors', async () => {
  queueOnce('todo_lists', { data: [{ id: 'list-1', database_id: 'db-1', name: 'To do', position: 0 }], error: null })
  queueOnce('todo_items', { data: [{ id: 'item-1', list_id: 'list-1', title: 'Task', assignee_id: 'u1', page_id: null, position: 0, due_date: null }], error: null })
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })
  const { getTodoBoard } = await import('@/lib/actions/todos')
  const result = await getTodoBoard('db-1', 'ws-1')
  expect(result.items[0].assignee_email).toBeUndefined()
})
```

```typescript
// BUG: see docs/testing-report-2026-08-28.md
it('silently returns an empty time report when the entries query errors', async () => {
  queueOnce('time_entries', { data: null, error: { message: 'query failed' } })
  const { getTimeReport } = await import('@/lib/actions/todos')
  const result = await getTimeReport('db-1', 'ws-1', '2026-08-28')
  expect(result).toEqual([])
})
```

Adjust field/table names in Steps 1-4 to exactly match the real `time_entries`/`todo_items`/`todo_lists` shapes already used by other tests in this file (re-read the existing `getTodoBoard`/`getTimeReport` tests immediately before writing these to copy field names verbatim).

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/__tests__/lib/actions/todos.test.ts`
Expected: all pass.

- [ ] **Step 6: Append the bug-report entries**

```markdown
### src/lib/actions/todos.ts (saveTimeEntry insert) — insert errors are swallowed silently

**Found by:** src/__tests__/lib/actions/todos.test.ts::saveTimeEntry > resolves without throwing even when the insert itself errors
**Behavior:** `saveTimeEntry` does not check the `error` returned from its `.insert()` call — a failed time-entry save resolves successfully from the caller's perspective, and the logged time is silently lost.
**Expected:** Throw (or otherwise surface) the error so the UI can tell the user their time entry wasn't saved.
**Severity:** important

### src/lib/actions/todos.ts (getTodoBoard memberRows RPC) — silent assignee-resolution failure

**Found by:** src/__tests__/lib/actions/todos.test.ts::getTodoBoard > silently renders no assignees when the member-email RPC errors
**Behavior:** The `get_workspace_member_emails` RPC's `error` is not checked; on failure, every item's `assignee_email` is silently omitted with no indication to the user that assignee data failed to load.
**Expected:** Surface the RPC error (log it and/or degrade visibly) instead of silently rendering as if no items had assignees.
**Severity:** important

### src/lib/actions/todos.ts (getTimeReport entries query) — silent empty report on query failure

**Found by:** src/__tests__/lib/actions/todos.test.ts::getTimeReport > silently returns an empty time report when the entries query errors
**Behavior:** The time-entries query's `error` is not checked; on failure, `getTimeReport` returns `[]`, which renders identically to "no time was logged today" in `TimeReportView`.
**Expected:** Surface the query error distinctly from a genuinely empty report.
**Severity:** important
```

- [ ] **Step 7: Commit**

```bash
git add src/__tests__/lib/actions/todos.test.ts docs/testing-report-2026-08-28.md
git commit -m "test: gap-fill todos.ts saveTimeEntry/updateTodoItem coverage, document 3 silent-failure bugs"
```

---

## Task 8: `lib/actions/query.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/actions/query.test.ts`

**Interfaces:**
- Consumes: `searchQuery(workspaceId, query, scope?)` from `@/lib/actions/query`.

- [ ] **Step 1: Write the failing test — final fallback tier when the ILIKE search also fails**

```typescript
it('falls all the way through to a generic search-failed error when both graph retrieval and the ILIKE fallback fail', async () => {
  vi.mocked(embed).mockRejectedValueOnce(new Error('ollama down'))
  queueOnce('pages', { data: null, error: { message: 'ilike query failed' } })
  const { searchQuery } = await import('@/lib/actions/query')
  const result = await searchQuery('ws-1', 'my search text')
  expect(result).toEqual({ error: 'Search failed' })
})
```

Match the mock name for the embed function (`embed`, imported from wherever `searchQuery`'s existing "ILIKE fallback on Ollama error" test already imports/mocks it from) and the exact ILIKE table/column this file's existing fallback test already queues against — reuse that test's setup as the base and just also fail its `.ilike()` result.

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/__tests__/lib/actions/query.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/lib/actions/query.test.ts
git commit -m "test: gap-fill query.ts final search-failed fallback branch"
```

---

## Task 9: `lib/graph/graph.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/graph/graph.test.ts`

**Interfaces:**
- Consumes: `upsertNode`, `scheduleEmbed` from `@/lib/graph/graph`.

- [ ] **Step 1: Write the failing test — `upsertNode` fallback message when both `data` and `error` are null**

```typescript
it('falls back to a generic message when the upsert returns neither data nor an error', async () => {
  queueOnce('nodes', { data: null, error: null })
  await expect(upsertNode(supabase, { entityType: 'page', entityId: 'page-1', workspaceId: 'ws-1', title: 'T', content: '' }))
    .rejects.toThrow('Failed to upsert node')
})
```

- [ ] **Step 2: Write the failing test — `scheduleEmbed` logs via `console.error` after exhausting all retries**

```typescript
it('logs to console.error after all 3 retry attempts fail', async () => {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers()
  mockRpc.mockResolvedValue({ data: null, error: { message: 'embedding failed' } })

  scheduleEmbed(supabase, 'node-1', 'some text')
  await vi.runAllTimersAsync()

  expect(consoleSpy).toHaveBeenCalled()
  consoleSpy.mockRestore()
  vi.useRealTimers()
})
```

Match this test's setup exactly to the existing "retries-3-times-then-gives-up-without-throwing" test immediately above it in the file (same fake-timer/mock-rpc scaffold) — this is purely an additional assertion on that same scenario, so where practical, extend the existing test in place with the `consoleSpy` assertion instead of duplicating the whole scenario in a new test.

- [ ] **Step 3: Run the tests**

Run: `npm test -- src/__tests__/lib/graph/graph.test.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/lib/graph/graph.test.ts
git commit -m "test: gap-fill graph.ts upsertNode fallback message and scheduleEmbed give-up logging"
```

---

## Task 10: `lib/graph/ollama.ts` gap-fill

**Files:**
- Modify: `src/__tests__/lib/graph/ollama.test.ts`

**Interfaces:**
- Consumes: the module's top-level `validateOllamaBase()` call (runs at import time via `const OLLAMA_BASE = validateOllamaBase(process.env.OLLAMA_URL ?? 'http://localhost:11434')`) — reached only by setting `process.env.OLLAMA_URL` and re-importing the module with `vi.resetModules()`.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('validateOllamaBase (module-load-time validation)', () => {
  const ORIGINAL_ENV = process.env.OLLAMA_URL

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.OLLAMA_URL
    else process.env.OLLAMA_URL = ORIGINAL_ENV
  })

  it('throws when OLLAMA_URL is not a valid URL', async () => {
    vi.resetModules()
    process.env.OLLAMA_URL = 'not a url'
    await expect(import('@/lib/graph/ollama')).rejects.toThrow()
  })

  it('throws when OLLAMA_URL uses a non-http(s) protocol', async () => {
    vi.resetModules()
    process.env.OLLAMA_URL = 'ftp://example.com'
    await expect(import('@/lib/graph/ollama')).rejects.toThrow()
  })
})
```

If `validateOllamaBase` throws synchronously at module top-level such that `import()` rejects, the `await expect(import(...)).rejects.toThrow()` shape above is correct; if instead the throw happens inside a try/caught-and-rethrown path that Vitest surfaces differently, adjust to `await expect(async () => { await import('@/lib/graph/ollama') }).rejects.toThrow()` — verify which shape actually fails first via Step 2 below before finalizing.

- [ ] **Step 2: Run the tests, adjusting the throw-assertion shape if needed**

Run: `npm test -- src/__tests__/lib/graph/ollama.test.ts`
Expected: both new tests pass; if the first attempt reports the module resolved instead of rejecting, switch to the wrapped-function form noted in Step 1 and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/lib/graph/ollama.test.ts
git commit -m "test: cover validateOllamaBase's invalid-URL and wrong-protocol throw branches"
```

---

## Task 11: `app/api/query/ask/route.ts` gap-fill

**Files:**
- Modify: `src/__tests__/app/api/query/ask.test.ts`

**Interfaces:**
- Consumes: the route's `POST(request: Request)` handler from `@/app/api/query/ask/route`.

- [ ] **Step 1: Write the failing tests — 400 validation branches**

```typescript
it('returns 400 when workspaceId is not a valid UUID', async () => {
  const req = new Request('http://localhost/api/query/ask', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: 'not-a-uuid', query: 'hello' }),
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
})

it('returns 400 when scope.databaseId is not a valid UUID', async () => {
  const req = new Request('http://localhost/api/query/ask', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: 'ws-uuid-goes-here-0000-000000000000', query: 'hello', scope: { databaseId: 'nope' } }),
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
})

it('returns 400 when the query is empty or not a string', async () => {
  const req = new Request('http://localhost/api/query/ask', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: '00000000-0000-0000-0000-000000000000', query: '   ' }),
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
})
```

Use whichever valid-UUID literal the existing 200-path test in this file already uses for `workspaceId`, so the "valid shape, invalid membership/content" tests below stay consistent with it.

- [ ] **Step 2: Write the failing test — 403 forbidden (non-member)**

```typescript
it('returns 403 when the caller is not a member of the workspace', async () => {
  // Reuse this file's existing mock scaffold: override the membership-check mock
  // to resolve with no matching row for this one test.
  mockMembershipCheck.mockResolvedValueOnce({ data: null, error: null })
  const req = new Request('http://localhost/api/query/ask', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: VALID_WORKSPACE_ID, query: 'hello' }),
  })
  const res = await POST(req)
  expect(res.status).toBe(403)
})
```

Replace `mockMembershipCheck` with the actual mock name the file's existing 401/200 tests already use for the workspace-membership check (read the file's mock scaffold at the top first — this is a Pattern C `createClient` mock, per the summary).

- [ ] **Step 3: Write the failing test — pre-stream `embed()`/`retrieveNodes()` failure → 503**

```typescript
it('returns 503 when embed/retrieveNodes fails before streaming starts', async () => {
  vi.mocked(embed).mockRejectedValueOnce(new Error('ollama unreachable'))
  const req = new Request('http://localhost/api/query/ask', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: VALID_WORKSPACE_ID, query: 'hello' }),
  })
  const res = await POST(req)
  expect(res.status).toBe(503)
})
```

Match the mock import path for `embed` to whatever this file already mocks for the mid-stream-failure test (per the summary, this file already tests `streamChat` throwing mid-stream — reuse the same `vi.mock('@/lib/graph/ollama', ...)` scaffold, just fail `embed` instead of `streamChat` for this test).

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/__tests__/app/api/query/ask.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/app/api/query/ask.test.ts
git commit -m "test: gap-fill ask route validation, forbidden, and pre-stream failure branches"
```

---

## Task 12: `BlockEditor.tsx` gap-fill

**Files:**
- Modify: `src/__tests__/components/editor/BlockEditor.test.tsx`

**Interfaces:**
- Consumes: `BlockEditor({ doc, onSave })` from `@/components/editor/BlockEditor`.

- [ ] **Step 1: Write the failing test — debounced save fires 1000ms after the last edit, using the latest `onSave` prop**

```typescript
it('debounces onUpdate, calling onSave once 1000ms after typing stops, using the current onSave prop', async () => {
  vi.useFakeTimers()
  const onSave = vi.fn()
  const { container } = render(<BlockEditor doc={{ type: 'doc', content: [{ type: 'paragraph' }] }} onSave={onSave} />)
  const editorEl = container.querySelector('.ProseMirror') as HTMLElement

  // Simulate two quick edits — only the second should schedule the timer that fires
  fireEvent.input(editorEl, { target: { textContent: 'a' } })
  await vi.advanceTimersByTimeAsync(500)
  fireEvent.input(editorEl, { target: { textContent: 'ab' } })
  await vi.advanceTimersByTimeAsync(999)
  expect(onSave).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(onSave).toHaveBeenCalledTimes(1)

  vi.useRealTimers()
})
```

Tiptap's `onUpdate` does not fire from a raw DOM `input` event on `.ProseMirror` in jsdom — it fires from the editor's own transaction dispatch. If the test above does not trigger `onUpdate`, replace the two `fireEvent.input(...)` lines with direct editor-instance calls: expose the editor via a test-only ref (e.g., render inside a small wrapper that grabs `editor` from `useEditor`'s return and calls `editor.commands.insertContent('a')` / `editor.commands.insertContent('b')` instead), since `insertContent` does dispatch a transaction and does fire `onUpdate`. Verify which approach actually triggers `onSave` by running the test before finalizing.

- [ ] **Step 2: Write the failing test — external `doc` prop change replaces editor content only when it actually differs**

```typescript
it('replaces editor content when the doc prop changes to different content', () => {
  const onSave = vi.fn()
  const doc1 = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }
  const doc2 = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] }
  const { rerender, container } = render(<BlockEditor doc={doc1} onSave={onSave} />)
  expect(container.querySelector('.ProseMirror')?.textContent).toContain('first')

  rerender(<BlockEditor doc={doc2} onSave={onSave} />)
  expect(container.querySelector('.ProseMirror')?.textContent).toContain('second')
})
```

- [ ] **Step 3: Write the failing test — unmount clears any pending save timer**

```typescript
it('clears the pending debounce timer on unmount, so a save scheduled just before unmount never fires', async () => {
  vi.useFakeTimers()
  const onSave = vi.fn()
  const { unmount } = render(<BlockEditor doc={{ type: 'doc', content: [{ type: 'paragraph' }] }} onSave={onSave} />)

  // Trigger the same onUpdate path used in Step 1, then unmount before the 1000ms elapses.
  unmount()
  await vi.advanceTimersByTimeAsync(1500)

  expect(onSave).not.toHaveBeenCalled()
  vi.useRealTimers()
})
```

- [ ] **Step 4: Run the tests, resolving the onUpdate-triggering mechanism from Step 1's note**

Run: `npm test -- src/__tests__/components/editor/BlockEditor.test.tsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/components/editor/BlockEditor.test.tsx
git commit -m "test: cover BlockEditor debounced save, doc-sync, and unmount cleanup"
```

---

## Task 13: `PageEditor.tsx` gap-fill

**Files:**
- Modify: `src/__tests__/components/editor/PageEditor.test.tsx`

**Interfaces:**
- Consumes: `PageEditor` props exactly as in the existing test file's `renderEditor()` helper — reuse it.

- [ ] **Step 1: Write the failing tests**

```typescript
it('reverts to the initial title (or "Untitled") when blurred with an empty value', () => {
  renderEditor()
  const input = screen.getByLabelText('Page title')
  fireEvent.change(input, { target: { value: '   ' } })
  fireEvent.blur(input)
  expect(input).toHaveValue('My Page')
})

it('reverts to "Untitled" when blurred empty and there was no initial title', () => {
  renderEditor({ initialTitle: '' })
  const input = screen.getByLabelText('Page title')
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  expect(input).toHaveValue('Untitled')
})

it('does not call updatePageTitle when the blurred value is empty', () => {
  renderEditor()
  const input = screen.getByLabelText('Page title')
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  expect(updatePageTitle).not.toHaveBeenCalled()
})

it('opens the options menu and deletes the page via the confirm dialog', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const pushMock = vi.fn()
  vi.mocked(await import('next/navigation')).useRouter.mockReturnValue({ push: pushMock })
  renderEditor()

  fireEvent.click(screen.getByLabelText('More options'))
  fireEvent.click(screen.getByText('Delete page'))

  await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/workspace/ws-1'))
})

it('does not delete the page when the confirm dialog is dismissed', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderEditor()

  fireEvent.click(screen.getByLabelText('More options'))
  fireEvent.click(screen.getByText('Delete page'))

  expect(screen.queryByText('save failed')).not.toBeInTheDocument()
})

it('shows "copied!" briefly after clicking share, then reverts', async () => {
  vi.useFakeTimers()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  renderEditor()

  fireEvent.click(screen.getByText('share'))
  await vi.advanceTimersByTimeAsync(0)
  expect(await screen.findByText('copied!')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(2000)
  expect(screen.getByText('share')).toBeInTheDocument()
  vi.useRealTimers()
})
```

Confirm the `next/navigation` mock at the top of this test file exports `useRouter` as a `vi.fn()` (not an inline arrow) before writing the router-push test — if it's currently `useRouter: () => ({ push: vi.fn() })` (a plain function, not a mock), change it to `useRouter: vi.fn(() => ({ push: vi.fn() }))` so `mockReturnValue` is available, and update the existing tests in the file if any relied on the old shape (none currently assert on `push`, per the file's existing test list, so this should be a safe, isolated change).

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/__tests__/components/editor/PageEditor.test.tsx`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/editor/PageEditor.test.tsx
git commit -m "test: gap-fill PageEditor title-revert, delete-page, and share-copy coverage"
```

---

## Task 14: `TimeReportView.tsx` — new test file

**Files:**
- Create: `src/__tests__/components/database/TimeReportView.test.tsx`

**Interfaces:**
- Consumes: `TimeReportView({ databaseId, workspaceId })`-shaped props (confirm the exact prop names against `src/components/database/TimeReportView.tsx` before writing — read the component's prop interface first) and `getTimeReport` from `@/lib/actions/todos`, which must be mocked.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TimeReportView } from '@/components/database/TimeReportView'
import { getTimeReport } from '@/lib/actions/todos'

vi.mock('@/lib/actions/todos', () => ({ getTimeReport: vi.fn() }))

describe('TimeReportView', () => {
  beforeEach(() => {
    vi.mocked(getTimeReport).mockReset()
  })

  it('shows a loading state while the report is being fetched', () => {
    vi.mocked(getTimeReport).mockReturnValue(new Promise(() => {})) // never resolves
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    expect(screen.getByRole('status', { hidden: true }) ?? screen.getByText(/loading/i)).toBeTruthy()
  })

  it('shows an empty state when no time has been logged for the day', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(screen.getByText(/no time/i)).toBeInTheDocument())
  })

  it('renders per-user rows sorted by total time, with the bar width scaled against the top user', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([
      { userId: 'u1', email: 'a@b.com', totalMs: 3600000, tasks: [{ itemId: 't1', itemTitle: 'Task A', ms: 3600000 }] },
      { userId: 'u2', email: 'c@d.com', totalMs: 1800000, tasks: [{ itemId: 't2', itemTitle: 'Task B', ms: 1800000 }] },
    ])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument())
    expect(screen.getByText('c@d.com')).toBeInTheDocument()
  })

  it('formats a duration with both hours and minutes as "Xh Ym"', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([
      { userId: 'u1', email: 'a@b.com', totalMs: 3660000, tasks: [{ itemId: 't1', itemTitle: 'Task A', ms: 3660000 }] },
    ])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(screen.getByText('1h 1m')).toBeInTheDocument())
  })

  it('formats a duration under an hour as "Xm Ys"', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([
      { userId: 'u1', email: 'a@b.com', totalMs: 65000, tasks: [{ itemId: 't1', itemTitle: 'Task A', ms: 65000 }] },
    ])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(screen.getByText('1m 5s')).toBeInTheDocument())
  })

  it('formats a duration under a minute as "Xs"', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([
      { userId: 'u1', email: 'a@b.com', totalMs: 45000, tasks: [{ itemId: 't1', itemTitle: 'Task A', ms: 45000 }] },
    ])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(screen.getByText('45s')).toBeInTheDocument())
  })

  it('expands a user row on click to reveal their per-task breakdown', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([
      { userId: 'u1', email: 'a@b.com', totalMs: 3600000, tasks: [{ itemId: 't1', itemTitle: 'Task A', ms: 3600000 }] },
    ])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument())

    expect(screen.queryByText('Task A')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('a@b.com'))
    expect(screen.getByText('Task A')).toBeInTheDocument()

    fireEvent.click(screen.getByText('a@b.com'))
    expect(screen.queryByText('Task A')).not.toBeInTheDocument()
  })

  it('falls back to "Untitled" for a task with no itemTitle', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([
      { userId: 'u1', email: 'a@b.com', totalMs: 1000, tasks: [{ itemId: 't1', itemTitle: '', ms: 1000 }] },
    ])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument())
    fireEvent.click(screen.getByText('a@b.com'))
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('re-fetches the report when the date changes', async () => {
    vi.mocked(getTimeReport).mockResolvedValue([])
    render(<TimeReportView databaseId="db-1" workspaceId="ws-1" />)
    await waitFor(() => expect(getTimeReport).toHaveBeenCalledTimes(1))

    const dateInput = screen.getByLabelText(/date/i)
    fireEvent.change(dateInput, { target: { value: '2026-08-27' } })
    await waitFor(() => expect(getTimeReport).toHaveBeenCalledTimes(2))
  })
})
```

Before finalizing, re-read `src/components/database/TimeReportView.tsx`'s prop interface, the exact loading-state markup (spinner element/role), the exact empty-state copy, the date-input's accessible label, and the `getTimeReport` call signature (`databaseId`, `workspaceId`, `date` argument order) so every selector and mock shape above matches the real component exactly rather than the illustrative shape here.

- [ ] **Step 2: Run the tests, adjusting selectors to match the real markup**

Run: `npm test -- src/__tests__/components/database/TimeReportView.test.tsx`
Expected: all pass after selector adjustments.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/database/TimeReportView.test.tsx
git commit -m "test: add TimeReportView test suite (was completely untested)"
```

---

## Task 15: `KanbanView.tsx` gap-fill

**Files:**
- Modify: `src/__tests__/components/database/KanbanView.test.tsx`

**Interfaces:**
- Consumes: whatever the existing ~30 tests already import/render from `@/components/database/KanbanView` — reuse that file's existing render helper and mock scaffold.

The existing suite already covers column/task CRUD, reorder, rename, attach/detach, and drag-and-drop edge cases (per the file's ~30 existing tests). Baseline branch coverage (56.2%) is low relative to test *count* because the file is 1340 lines with several largely-untested sub-areas. Add tests for these specific, currently-unexercised behaviors (grounded in `src/components/database/KanbanView.tsx`'s actual functions):

- [ ] **Step 1: `readMeta`/`readTimeLog` corrupt-localStorage fallback (lines ~101-112)**

```typescript
it('falls back to default task metadata when localStorage holds corrupt JSON for that task', () => {
  localStorage.setItem('kanban-meta:item-1', '{not valid json')
  const board = renderBoard() // use the existing test file's board-render helper
  fireEvent.click(screen.getByText('Task One')) // open the task's detail drawer
  expect(screen.getByLabelText(/priority/i)).toBeInTheDocument() // renders with default (null) priority, doesn't throw
})

it('falls back to an empty time log when localStorage holds corrupt JSON for a task\'s time log', () => {
  localStorage.setItem('kanban-timelog:item-1', 'not json at all')
  renderBoard()
  fireEvent.click(screen.getByText('Task One'))
  expect(screen.getByText(/0s|no time logged/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: `msToDisplay`/`timerDisplay` formatting boundaries (lines ~77-99)**

```typescript
it('displays an elapsed timer under a minute in seconds-only format', () => {
  vi.useFakeTimers()
  renderBoard()
  fireEvent.click(screen.getByText('Task One'))
  fireEvent.click(screen.getByLabelText(/start timer/i))
  vi.advanceTimersByTime(45000)
  expect(screen.getByText(/0:45|45s/)).toBeInTheDocument()
  vi.useRealTimers()
})
```

- [ ] **Step 3: `TaskDetailDrawer` title/description commit and label add (lines ~283-330)**

```typescript
it('does not call onRename when the title draft is unchanged on blur', () => {
  renderBoard()
  fireEvent.click(screen.getByText('Task One'))
  const titleInput = screen.getByDisplayValue('Task One')
  fireEvent.blur(titleInput)
  // Assert against whatever the existing rename tests in this file already assert
  // (e.g. the mocked updateTodoItem/onBoardChange was not called with a title patch)
})

it('adds a new label to the task via the label input', () => {
  renderBoard()
  fireEvent.click(screen.getByText('Task One'))
  fireEvent.change(screen.getByPlaceholderText(/add label/i), { target: { value: 'urgent' } })
  fireEvent.keyDown(screen.getByPlaceholderText(/add label/i), { key: 'Enter' })
  expect(screen.getByText('urgent')).toBeInTheDocument()
})
```

- [ ] **Step 4: `handleDragEnd` move-to-different-column and invalid-target no-op (line ~1233)**

```typescript
it('moves a task to a different column via drag-and-drop', () => {
  renderBoard()
  // Use whatever drag-simulation helper the existing drag-and-drop tests in this
  // file already define (per the summary, this file already tests "unknown-id
  // and out-of-bounds-target no-ops" — call that same helper with a valid
  // cross-column source/target pair instead of an invalid one).
})
```

For Steps 1-4, before finalizing selectors/helpers, read the existing `KanbanView.test.tsx` file in full to reuse its render helper, its `localStorage` key format (confirm the exact key strings `kanban-meta:${id}` / `kanban-timelog:${id}` against the real `readMeta`/`writeMeta`/`readTimeLog`/`writeTimeLog` implementations in `KanbanView.tsx`), its drag-simulation helper, and its existing task-fixture shape — adjust every illustrative selector above to match exactly.

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/__tests__/components/database/KanbanView.test.tsx`
Expected: all pass after adjusting to the real helpers/selectors.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/components/database/KanbanView.test.tsx
git commit -m "test: gap-fill KanbanView localStorage-fallback, timer-formatting, and drag-to-column coverage"
```

---

## Task 16: `Sidebar.tsx` gap-fill

**Files:**
- Modify: `src/__tests__/components/layout/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `Sidebar` props exactly as the existing file's tests already pass; `createDatabase` from `@/lib/actions/databases` (already mocked in the file per `vi.mock('@/lib/actions/databases', () => ({ createDatabase: vi.fn() }))`); `createClient` from `@/lib/supabase/client` (not yet mocked in this file — must be added for the sign-out tests).

- [ ] **Step 1: Add the `@/lib/supabase/client` mock**

At the top of the file, add:

```typescript
const mockSignOut = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ auth: { signOut: mockSignOut } })),
}))
```

- [ ] **Step 2: Write the failing tests — create-database flow**

```typescript
it('creates a database and navigates to it when clicked from the sidebar tree', async () => {
  const pushMock = vi.fn()
  vi.mocked(await import('next/navigation')).useRouter.mockReturnValue({ push: pushMock })
  vi.mocked(await import('@/lib/actions/databases')).createDatabase.mockResolvedValue({ database: { id: 'db-1' } })
  render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)

  fireEvent.click(screen.getByRole('button', { name: /new database/i }))

  await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/workspace/ws-1/database/db-1'))
})

it('shows an error message in the sidebar when database creation fails', async () => {
  vi.mocked(await import('@/lib/actions/databases')).createDatabase.mockRejectedValue(new Error('quota exceeded'))
  render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)

  fireEvent.click(screen.getByRole('button', { name: /new database/i }))

  await waitFor(() => expect(screen.getByText('quota exceeded')).toBeInTheDocument())
})
```

Confirm the actual accessible name of the "create database" trigger by reading `SidebarDatabaseTree`'s rendered output (it's the `onCreateDatabase` prop passed through from `Sidebar`) — adjust the `getByRole` query to match its real label.

- [ ] **Step 3: Write the failing tests — user menu and sign-out**

```typescript
it('opens the user menu on click and shows a Settings link scoped to the current workspace', () => {
  render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
  fireEvent.click(screen.getByLabelText('User menu'))
  expect(screen.getByText('Settings & members').closest('a')).toHaveAttribute('href', '/workspace/ws-1/settings')
})

it('signs out and redirects to /login on successful sign-out', async () => {
  mockSignOut.mockResolvedValue({ error: null })
  delete (window as unknown as { location: unknown }).location
  window.location = { href: '' } as unknown as Location
  render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)

  fireEvent.click(screen.getByLabelText('User menu'))
  fireEvent.click(screen.getByText('Sign out'))

  await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
})

it('closes the user menu without redirecting when sign-out throws', async () => {
  mockSignOut.mockRejectedValue(new Error('network error'))
  render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)

  fireEvent.click(screen.getByLabelText('User menu'))
  fireEvent.click(screen.getByText('Sign out'))

  await waitFor(() => expect(screen.queryByText('Sign out')).not.toBeInTheDocument())
})
```

- [ ] **Step 4: Write the failing test — mobile close button**

```typescript
it('calls onMobileClose when the mobile close button is clicked', () => {
  const onMobileClose = vi.fn()
  render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} onMobileClose={onMobileClose} />)
  fireEvent.click(screen.getByLabelText('Close sidebar'))
  expect(onMobileClose).toHaveBeenCalled()
})
```

- [ ] **Step 5: Write the failing test — no-workspace-selected state hides workspace-scoped UI**

```typescript
it('hides the Ask link, database tree, and settings link when no workspace is selected', () => {
  vi.mocked(useParams).mockReturnValueOnce({})
  render(<Sidebar workspaces={mockWorkspaces} user={mockUser} pages={[]} databases={[]} />)
  expect(screen.queryByText('Ask AI')).not.toBeInTheDocument()
})
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- src/__tests__/components/layout/Sidebar.test.tsx`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/__tests__/components/layout/Sidebar.test.tsx
git commit -m "test: gap-fill Sidebar create-database, user-menu, sign-out, and no-workspace coverage"
```

---

## Task 17: `CmdKModal.tsx` gap-fill

**Files:**
- Modify: `src/__tests__/components/query/CmdKModal.test.tsx`

**Interfaces:**
- Consumes: `CmdKModal` props as in the existing file; `searchQuery` from `@/lib/actions/query`, which is not yet mocked in this file's existing tests (they only exercise open/close/navigation, not the search itself) — add `vi.mock('@/lib/actions/query', () => ({ searchQuery: vi.fn() }))`.

- [ ] **Step 1: Add the `searchQuery` mock and write the failing tests**

```typescript
import { searchQuery } from '@/lib/actions/query'
vi.mock('@/lib/actions/query', () => ({ searchQuery: vi.fn() }))

// ... inside the describe block, add:

it('debounces typing and calls searchQuery after 300ms, rendering results', async () => {
  vi.useFakeTimers()
  vi.mocked(searchQuery).mockResolvedValue([{ id: 'r1', title: 'Result One', entityType: 'page' } as never])
  render(<CmdKModal databases={[]} pages={[]} open onClose={vi.fn()} />)

  fireEvent.change(screen.getByPlaceholderText(/search pages and databases/i), { target: { value: 'foo' } })
  await vi.advanceTimersByTimeAsync(300)

  expect(searchQuery).toHaveBeenCalledWith('ws-1', 'foo', {})
  vi.useRealTimers()
})

it('shows the error message when searchQuery returns an error result', async () => {
  vi.useFakeTimers()
  vi.mocked(searchQuery).mockResolvedValue({ error: 'Search failed' })
  render(<CmdKModal databases={[]} pages={[]} open onClose={vi.fn()} />)

  fireEvent.change(screen.getByPlaceholderText(/search pages and databases/i), { target: { value: 'foo' } })
  await vi.advanceTimersByTimeAsync(300)

  expect(await screen.findByText('Search failed')).toBeInTheDocument()
  vi.useRealTimers()
})

it('shows the "no results" empty state when the query is non-empty but nothing matches', async () => {
  vi.useFakeTimers()
  vi.mocked(searchQuery).mockResolvedValue([])
  render(<CmdKModal databases={[]} pages={[]} open onClose={vi.fn()} />)

  fireEvent.change(screen.getByPlaceholderText(/search pages and databases/i), { target: { value: 'foo' } })
  await vi.advanceTimersByTimeAsync(300)

  expect(await screen.findByText(/no results/i)).toBeInTheDocument()
  vi.useRealTimers()
})

it('scopes the search to the current database when opened while on a database route', () => {
  vi.mocked(useParams).mockReturnValueOnce({ workspaceId: 'ws-1', databaseId: 'db-1' })
  render(<CmdKModal databases={[]} pages={[]} open onClose={vi.fn()} />)
  expect(screen.getByLabelText('Scope')).toHaveValue('db-1')
})

it('clears query, results, and error when closed', async () => {
  vi.useFakeTimers()
  vi.mocked(searchQuery).mockResolvedValue({ error: 'Search failed' })
  const onClose = vi.fn()
  render(<CmdKModal databases={[]} pages={[]} open onClose={onClose} />)
  fireEvent.change(screen.getByPlaceholderText(/search pages and databases/i), { target: { value: 'foo' } })
  await vi.advanceTimersByTimeAsync(300)
  await screen.findByText('Search failed')

  fireEvent.click(screen.getByLabelText('Close'))
  expect(onClose).toHaveBeenCalled()
  vi.useRealTimers()
})
```

Confirm the `useParams` mock in this file is a `vi.fn()` (allowing `mockReturnValueOnce`) rather than an inline object — adjust to `vi.fn(() => ({ workspaceId: 'ws-1' }))` if it currently isn't, matching the same fix pattern as Task 13's `useRouter` note.

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/__tests__/components/query/CmdKModal.test.tsx`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/query/CmdKModal.test.tsx
git commit -m "test: cover CmdKModal debounced search, error/empty states, and scope selection"
```

---

## Task 18: `AskPageClient.tsx` gap-fill

**Files:**
- Modify: `src/__tests__/components/query/AskPageClient.test.tsx`

**Interfaces:**
- Consumes: `AskPageClient` props and the `useAsk` hook mock already established by the existing 17 tests in this file.

The existing suite is already thorough (baseline 89.74% branch, 17 tests covering the recent-questions list, hasAsked derivation, source-card rendering, auto-ask deep-linking, and reset/loading states). Add just the one identified gap:

- [ ] **Step 1: Write the failing test — changing the scope select calls `setScope` with the chosen database, or clears it back to `{}`**

```typescript
it('sets the scope to the selected database, and clears it back to {} when "All" is re-selected', () => {
  const setScope = vi.fn()
  mockUseAsk.mockReturnValue({ ...defaultAskState, scope: {}, setScope }) // reuse this file's existing mockUseAsk/defaultAskState fixture
  render(<AskPageClient workspaceId="ws-1" scopeOptions={[{ id: 'db-1', title: 'My Database' }]} recentQueries={[]} />)

  fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'db-1' } })
  expect(setScope).toHaveBeenCalledWith({ databaseId: 'db-1' })

  fireEvent.change(screen.getByLabelText('Scope'), { target: { value: '' } })
  expect(setScope).toHaveBeenCalledWith({})
})
```

Match `mockUseAsk`/`defaultAskState` to whatever fixture name the file's existing 17 tests already use for mocking `@/lib/hooks/useAsk` (read the top of the file first) — reuse it exactly rather than introducing a second mock shape.

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/__tests__/components/query/AskPageClient.test.tsx`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/query/AskPageClient.test.tsx
git commit -m "test: cover AskPageClient scope-select set/clear branch"
```

---

## Task 19: `SignupForm.tsx` finish-up

**Files:**
- Modify: `src/__tests__/components/auth/SignupForm.test.tsx`

**Interfaces:**
- Consumes: `SignupForm` (no props) from `@/components/auth/SignupForm`; `createWorkspace`, `sendInvite` from `@/lib/actions/workspaces` (already mocked by the existing suite); `createClient` from `@/lib/supabase/client` (already mocked by the existing suite, exposing `auth.signUp`/`auth.getUser` and a `from(...)` chain for the `workspace_members` lookup in Step 3).

Given the file's baseline is already 92.18% (close to the ~95% Tier B target) and it already has ~20 tests spanning all three steps, add only the following concretely-identified gaps, cross-checked against `handleInvites`' full branch set in `src/components/auth/SignupForm.tsx`:

- [ ] **Step 1: Write the failing test — Step 3 throws when the session unexpectedly has no user**

```typescript
it('shows an error and does not send invites when the session has expired by step 3', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: null } }) // reuse this file's existing mockGetUser/supabase mock
  // Drive the form to step 3 exactly as the existing "Step 3: Invite teammates" tests already do.
  await advanceToStep3() // reuse this file's existing helper, if present; otherwise inline the same steps those tests use
  fireEvent.click(screen.getByRole('button', { name: /send invites/i }))
  await waitFor(() => expect(screen.getByText('Session expired — please sign in again.')).toBeInTheDocument())
})

it('shows an error when the workspace lookup returns no row', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
  queueOnce('workspace_members', { data: null, error: null }) // reuse this file's existing table-mock helper
  await advanceToStep3()
  fireEvent.click(screen.getByRole('button', { name: /send invites/i }))
  await waitFor(() => expect(screen.getByText('Could not find your workspace.')).toBeInTheDocument())
})

it('silently skips an invite email that fails to send, still showing links for the ones that succeeded', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
  queueOnce('workspace_members', { data: { workspace_id: 'ws-1' }, error: null })
  vi.mocked(sendInvite).mockRejectedValueOnce(new Error('duplicate'))
  vi.mocked(sendInvite).mockResolvedValueOnce({ token: 'tok-good' })
  await advanceToStep3(['bad@dup.com', 'good@example.com'])
  fireEvent.click(screen.getByRole('button', { name: /send invites/i }))
  await waitFor(() => expect(screen.getByText('good@example.com')).toBeInTheDocument())
  expect(screen.queryByText('bad@dup.com')).not.toBeInTheDocument()
})

it('redirects to / when no invite emails were entered at all', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
  queueOnce('workspace_members', { data: { workspace_id: 'ws-1' }, error: null })
  delete (window as unknown as { location: unknown }).location
  window.location = { href: '' } as unknown as Location
  await advanceToStep3([])
  fireEvent.click(screen.getByRole('button', { name: /send invites/i }))
  await waitFor(() => expect(window.location.href).toBe('/'))
})
```

Before finalizing, read `src/__tests__/components/auth/SignupForm.test.tsx` in full to find (a) its actual helper for driving the form from Step 1 through Step 3 (or inline the same fireEvent sequence its existing Step 3 tests already use), (b) its actual mock names for `supabase.auth.getUser` and the `workspace_members` table lookup, and (c) whether it already asserts the exact error copy strings used above — copy them verbatim from the source file's literal error messages (`'Session expired — please sign in again.'`, `'Could not find your workspace.'`) rather than paraphrasing.

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/__tests__/components/auth/SignupForm.test.tsx`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/auth/SignupForm.test.tsx
git commit -m "test: finish SignupForm step-3 invite-sending edge cases"
```

---

## Task 20: `electron/main.ts` — new test file

**Files:**
- Create: `src/__tests__/electron/main.test.ts`

**Interfaces:**
- Consumes: this file requires mocking the `electron` module (`app`, `BrowserWindow`, `dialog`), `node:child_process` (`spawn`), and `./findFreePort` before importing `electron/main.ts`, since the module wires up `app.whenReady().then(startServerAndWindow)` and event listeners at import time.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLoadURL = vi.fn()
const mockWhenReady = vi.fn()
const mockOn = vi.fn()
const mockQuit = vi.fn()
const mockShowErrorBox = vi.fn()
const mockSpawnOn = vi.fn()
const mockKill = vi.fn()

vi.mock('electron', () => ({
  app: {
    whenReady: mockWhenReady,
    on: mockOn,
    quit: mockQuit,
    isReady: vi.fn(() => true),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({ loadURL: mockLoadURL })),
  dialog: { showErrorBox: mockShowErrorBox },
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ on: mockSpawnOn, kill: mockKill, killed: false })),
}))

vi.mock('../../electron/findFreePort', () => ({
  findFreePort: vi.fn().mockResolvedValue(4123),
}))

describe('electron/main', () => {
  const ORIGINAL_ENV = process.env.ELECTRON_DEV_SERVER_URL

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    delete process.env.ELECTRON_DEV_SERVER_URL
  })

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ELECTRON_DEV_SERVER_URL
    else process.env.ELECTRON_DEV_SERVER_URL = ORIGINAL_ENV
  })

  it('opens a window against the dev server URL when ELECTRON_DEV_SERVER_URL is set, without spawning a server', async () => {
    process.env.ELECTRON_DEV_SERVER_URL = 'http://localhost:3000'
    mockWhenReady.mockReturnValue(Promise.resolve())
    await import('../../electron/main')
    await new Promise(process.nextTick) // flush the whenReady().then(...) microtask

    const { spawn } = await import('node:child_process')
    expect(spawn).not.toHaveBeenCalled()
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:3000')
  })

  it('kills the server on window-all-closed and quits on non-macOS', async () => {
    mockWhenReady.mockReturnValue(Promise.resolve())
    await import('../../electron/main')
    await new Promise(process.nextTick)

    const call = mockOn.mock.calls.find(c => c[0] === 'window-all-closed')
    expect(call).toBeDefined()
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    call![1]()
    expect(mockQuit).toHaveBeenCalled()
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('does not quit on window-all-closed when running on macOS', async () => {
    mockWhenReady.mockReturnValue(Promise.resolve())
    await import('../../electron/main')
    await new Promise(process.nextTick)

    const call = mockOn.mock.calls.find(c => c[0] === 'window-all-closed')
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    call![1]()
    expect(mockQuit).not.toHaveBeenCalled()
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('shows an error dialog and quits when the spawned server process errors', async () => {
    mockWhenReady.mockReturnValue(Promise.resolve())
    const { spawn } = await import('node:child_process')
    vi.mocked(spawn).mockReturnValue({ on: mockSpawnOn, kill: mockKill, killed: false } as never)
    await import('../../electron/main')
    await new Promise(process.nextTick)
    await new Promise(process.nextTick) // allow findFreePort's promise to resolve too

    const errorCall = mockSpawnOn.mock.calls.find(c => c[0] === 'error')
    expect(errorCall).toBeDefined()
    errorCall![1](new Error('spawn failed'))
    expect(mockShowErrorBox).toHaveBeenCalled()
    expect(mockQuit).toHaveBeenCalled()
  })
})
```

Electron main-process modules that call `app.whenReady().then(startServerAndWindow)` and register listeners as side effects of import are inherently awkward to test via plain `import()` — the exact number of `process.nextTick` flushes needed to reach each assertion point is not fully knowable without running the test. Treat the flush counts above as a starting point: run the suite, and if an assertion fires before the relevant mock has been called, insert an additional `await new Promise(process.nextTick)` (or `await vi.waitFor(() => expect(...).toHaveBeenCalled())`) at that point rather than changing the mocked behavior.

- [ ] **Step 2: Run the tests, adjusting flush timing as needed**

Run: `npm test -- src/__tests__/electron/main.test.ts`
Expected: all pass once flush timing is correct.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/electron/main.test.ts
git commit -m "test: add electron/main.ts test suite covering dev/packaged startup and lifecycle handlers"
```

---

## Task 21: `electron/findFreePort.ts` finish-up

**Files:**
- Modify: `src/__tests__/electron/findFreePort.test.ts`

**Interfaces:**
- Consumes: `findFreePort()` from `../../electron/findFreePort`. Requires mocking `node:net`'s `createServer` for these two specific branches, since they can't be triggered by real socket behavior portably.

- [ ] **Step 1: Write the failing tests**

```typescript
it('rejects when the underlying server emits an error', async () => {
  vi.resetModules()
  vi.doMock('node:net', () => ({
    createServer: vi.fn(() => {
      const handlers: Record<string, (...args: unknown[]) => void> = {}
      return {
        unref: vi.fn(),
        listen: vi.fn(function (this: unknown) { return this }),
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { handlers[event] = cb; return this }),
        address: vi.fn(() => ({ port: 1234 })),
        close: vi.fn(),
        emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
      }
    }),
  }))
  const { findFreePort } = await import('../../electron/findFreePort')
  const netModule = await import('node:net')
  const serverInstance = vi.mocked(netModule.createServer).mock.results
  const promise = findFreePort()
  const server = vi.mocked(netModule.createServer).mock.results[0].value
  server.emit('error', new Error('EADDRINUSE'))
  await expect(promise).rejects.toThrow()
  vi.doUnmock('node:net')
})

it('rejects when server.address() returns something other than an object', async () => {
  vi.resetModules()
  vi.doMock('node:net', () => ({
    createServer: vi.fn(() => ({
      unref: vi.fn(),
      listen: vi.fn(function (this: unknown, _port: number, cb: () => void) { cb(); return this }),
      on: vi.fn(function (this: unknown) { return this }),
      address: vi.fn(() => 'a-string-not-an-object'),
      close: vi.fn(),
    })),
  }))
  const { findFreePort } = await import('../../electron/findFreePort')
  await expect(findFreePort()).rejects.toThrow()
  vi.doUnmock('node:net')
})
```

Read `electron/findFreePort.ts` immediately before finalizing these two tests to confirm the exact `listen(...)` callback signature (does it call back with `(port, host, cb)` or `(port, cb)`?) and the exact rejection message/condition on a non-object `address()` return, so the mock's `listen`/`address` shapes match precisely.

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/__tests__/electron/findFreePort.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/electron/findFreePort.test.ts
git commit -m "test: cover findFreePort's server-error and bad-address-shape rejection branches"
```

---

## Task 22: New e2e spec — `e2e/workspaces.spec.ts`

**Files:**
- Create: `e2e/workspaces.spec.ts`

**Interfaces:**
- Follows the exact structure of `e2e/auth.spec.ts` (dynamic `Date.now()`-based emails, `page.goto`/`getByLabel`/`getByRole` locators, `page.waitForURL`).

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'

test.describe('signup wizard — organization step', () => {
  test('shows a validation message when no organization name is entered', async ({ page }) => {
    const email = `e2e-org-${Date.now()}@example.com`
    await page.goto('/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('testpassword123')
    await page.getByRole('button', { name: /continue/i }).click()

    // Depending on email-confirmation config this may land on step 2 immediately
    // or require confirming the email first — mirror e2e/auth.spec.ts's handling
    // of that same environment difference.
    await page.waitForURL(/\/signup/, { timeout: 15000 }).catch(() => {})

    const orgNameInput = page.getByLabel(/organization name/i)
    if (await orgNameInput.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /create organization/i }).click()
      await expect(page.getByText('Please enter an organization name.')).toBeVisible()
    }
  })

  test('creates an organization and advances to the invite step', async ({ page }) => {
    const email = `e2e-org2-${Date.now()}@example.com`
    await page.goto('/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('testpassword123')
    await page.getByRole('button', { name: /continue/i }).click()

    const orgNameInput = page.getByLabel(/organization name/i)
    if (await orgNameInput.isVisible().catch(() => false)) {
      await orgNameInput.fill('E2E Test Org')
      await page.getByRole('button', { name: /create organization/i }).click()
      await expect(page.getByText(/invite teammates/i)).toBeVisible()
    }
  })
})
```

Before finalizing, check how `e2e/auth.spec.ts` handles the local-vs-production email-confirmation environment difference (the summary notes it has "environment-aware assertions" with comments explaining this) and mirror that exact pattern here instead of the `isVisible().catch()` guard sketched above, for consistency with the rest of the suite.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/workspaces.spec.ts`
Expected: both tests pass (or are correctly skipped/adjusted per the local email-confirmation behavior, matching `auth.spec.ts`'s convention).

- [ ] **Step 3: Commit**

```bash
git add e2e/workspaces.spec.ts
git commit -m "test: add e2e coverage for the signup wizard's organization step"
```

---

## Task 23: New e2e spec — `e2e/invites.spec.ts`

**Files:**
- Create: `e2e/invites.spec.ts`

**Interfaces:**
- Reuses the login `beforeEach` pattern from `e2e/pages.spec.ts`/`e2e/databases.spec.ts` (fill Email/Password from `process.env.E2E_EMAIL`/`E2E_PASSWORD`, sign in, wait for `/workspace/`).

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'

test.describe('invites', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('sends an invite from settings and shows the generated link for copying', async ({ page }) => {
    await page.getByLabel('User menu').click()
    await page.getByText('Settings & members').click()
    await page.waitForURL(/\/settings/)

    const inviteEmail = `e2e-invite-${Date.now()}@example.com`
    await page.getByLabel(/invite/i).fill(inviteEmail)
    await page.getByRole('button', { name: /send invite/i }).click()

    await expect(page.getByText(inviteEmail)).toBeVisible()
  })

  test('accepting an invite in a new browser context adds the member to the workspace', async ({ page, browser }) => {
    await page.getByLabel('User menu').click()
    await page.getByText('Settings & members').click()
    await page.waitForURL(/\/settings/)

    const inviteEmail = `e2e-accept-${Date.now()}@example.com`
    await page.getByLabel(/invite/i).fill(inviteEmail)
    await page.getByRole('button', { name: /send invite/i }).click()

    const inviteLink = await page.getByRole('link', { name: /copy invite link|invite link/i }).getAttribute('href')
    expect(inviteLink).toBeTruthy()

    // Accept as a fresh, unauthenticated session
    const newContext = await browser.newContext()
    const newPage = await newContext.newPage()
    await newPage.goto(inviteLink!)
    // New-user acceptance requires signing up first — mirror auth.spec.ts's signup flow here.
    await expect(newPage.getByText(/accept invite|join workspace/i)).toBeVisible()
    await newContext.close()

    // Back on the inviter's page, the new member should eventually appear once accepted
    await page.reload()
    await expect(page.getByText(inviteEmail)).toBeVisible()
  })
})
```

Before finalizing, inspect the actual settings page markup (the invite input's accessible label, the "copy link" control's exact text/role, and the invite-acceptance page's route/copy) by reading `src/app/(app)/workspace/[workspaceId]/settings/` (or wherever the settings route lives) and the invite-acceptance route, and adjust every selector above to match exactly — this spec's selectors are illustrative and must be grounded in the real markup before it can pass.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/invites.spec.ts`
Expected: both tests pass after selector grounding.

- [ ] **Step 3: Commit**

```bash
git add e2e/invites.spec.ts
git commit -m "test: add e2e coverage for sending and accepting workspace invites"
```

---

## Task 24: New e2e spec — `e2e/todos.spec.ts`

**Files:**
- Create: `e2e/todos.spec.ts`

**Interfaces:**
- Same login `beforeEach` pattern as Task 23; navigates to a database's Time-view for the time-entry portion.

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'

test.describe('todos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('creates a todo, assigns it to a workspace member, and shows the assignee email on the card', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: /kanban/i }).click()

    await page.getByRole('button', { name: /add task|new task/i }).first().click()
    await page.getByPlaceholder(/task title|untitled/i).fill('E2E Test Task')
    await page.keyboard.press('Enter')

    await page.getByText('E2E Test Task').click()
    await page.getByLabel(/assignee/i).click()
    await page.getByText(process.env.E2E_EMAIL ?? 'test@example.com').click()

    await expect(page.getByText(process.env.E2E_EMAIL ?? 'test@example.com')).toBeVisible()
  })

  test('logs time on a task from the Time view', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: /time/i }).click()

    await expect(page.getByText(/no time/i)).toBeVisible()
  })
})
```

Before finalizing, read `KanbanView.tsx`'s actual "add task" button label, the task-card assignee-picker's accessible label, and `DatabaseShell.tsx`'s view-switcher tab labels ("Kanban"/"Time") to ground every selector — this spec is illustrative and needs those exact strings confirmed against the real components.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/todos.spec.ts`
Expected: both tests pass after selector grounding.

- [ ] **Step 3: Commit**

```bash
git add e2e/todos.spec.ts
git commit -m "test: add e2e coverage for todo assignment and time-tracking"
```

---

## Task 25: New e2e spec — `e2e/query.spec.ts`

**Files:**
- Create: `e2e/query.spec.ts`

**Interfaces:**
- Same login `beforeEach` pattern as Tasks 23-24. Per the spec, Ollama responses should be mocked "consistent with how other e2e specs mock external services" — check `e2e/editor.spec.ts`/`e2e/files.spec.ts` for whether any of them already mock a backend call via `page.route(...)`, and follow that exact convention (none of the four already-read e2e specs currently mock Ollama, since none exercise Ask; if no existing convention exists, use Playwright's `page.route('**/api/query/ask', ...)` to return a canned streamed response).

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'

test.describe('query', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('Cmd+K search returns results and navigates to the selected page', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).click()
    await page.waitForURL(/\/page\//)
    await page.getByPlaceholder('Untitled').fill('Findable Page Title')
    await page.getByPlaceholder('Untitled').blur()

    await page.keyboard.press('Meta+k')
    await page.getByPlaceholder(/search pages and databases/i).fill('Findable Page Title')
    await expect(page.getByText('Findable Page Title')).toBeVisible()
    await page.getByText('Findable Page Title').click()
    await page.waitForURL(/\/page\//)
  })

  test('Ask page submits a question and renders a streamed answer', async ({ page }) => {
    await page.route('**/api/query/ask', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        headers: { 'X-Sources': '[]' },
        body: 'This is a mocked answer.',
      })
    })

    await page.getByText('Ask AI').click()
    await page.waitForURL(/\/ask/)
    await page.getByLabel('Ask a question').fill('What is graphbrain?')
    await page.getByRole('button', { name: 'Ask' }).click()

    await expect(page.getByText('This is a mocked answer.')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/query.spec.ts`
Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/query.spec.ts
git commit -m "test: add e2e coverage for Cmd+K search navigation and the Ask flow"
```

---

## Task 26: Tier C smoke tests

**Files:**
- Create: `src/__tests__/components/auth/ConstellationField.test.tsx`
- Create: `src/__tests__/components/editor/extensions/slash-items.test.ts`
- Create: `src/__tests__/lib/supabase/client.test.ts`
- Create: `src/__tests__/lib/supabase/server.test.ts`

**Interfaces:**
- Consumes: `ConstellationField` from `@/components/auth/ConstellationField`; `slashItems`, `filterSlashItems` from `@/components/editor/extensions/slash-items`; `createClient` from `@/lib/supabase/client` and from `@/lib/supabase/server`.

- [ ] **Step 1: `ConstellationField.tsx` smoke test**

```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ConstellationField } from '@/components/auth/ConstellationField'

describe('ConstellationField', () => {
  it('mounts and unmounts without throwing', () => {
    const { unmount } = render(<ConstellationField />)
    expect(() => unmount()).not.toThrow()
  })
})
```

Canvas's 2D context is frequently `null` in jsdom by default; the component already guards `if (!ctx) return`, so this smoke test should pass without a canvas mock. If jsdom throws on `canvas.getContext('2d')` instead of returning `null`, add a minimal stub: `HTMLCanvasElement.prototype.getContext = () => null` before the `render` call.

- [ ] **Step 2: `slash-items.ts` smoke test**

```typescript
import { describe, it, expect } from 'vitest'
import { slashItems, filterSlashItems } from '@/components/editor/extensions/slash-items'

describe('slashItems', () => {
  it('every item has a title, at least one keyword, a valid group, and a command function', () => {
    for (const item of slashItems) {
      expect(item.title).toBeTruthy()
      expect(item.keywords.length).toBeGreaterThan(0)
      expect(['Basic', 'Media']).toContain(item.group)
      expect(typeof item.command).toBe('function')
    }
  })

  it('filterSlashItems returns everything for an empty/whitespace query', () => {
    expect(filterSlashItems('   ')).toEqual(slashItems)
  })

  it('filterSlashItems matches by title or keyword, case-insensitively', () => {
    const results = filterSlashItems('CHECK')
    expect(results.some(i => i.title === 'To-do')).toBe(true)
  })
})
```

- [ ] **Step 3: `lib/supabase/client.ts` smoke test**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/ssr', () => ({ createBrowserClient: vi.fn(() => ({ mocked: true })) }))

describe('supabase client factory', () => {
  it('constructs a browser client using the configured URL and anon key', async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const { createBrowserClient } = await import('@supabase/ssr')
    createClient()
    expect(createBrowserClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
  })
})
```

- [ ] **Step 4: `lib/supabase/server.ts` smoke test**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ mocked: true })) }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}))

describe('supabase server client factory', () => {
  it('constructs a server client wired to the Next.js cookie store', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const { createServerClient } = await import('@supabase/ssr')
    await createClient()
    expect(createServerClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({ cookies: expect.objectContaining({ getAll: expect.any(Function), setAll: expect.any(Function) }) }),
    )
  })

  it('swallows an error from cookieStore.set when called outside a request context (e.g. a Server Component)', async () => {
    vi.mocked((await import('next/headers')).cookies).mockResolvedValueOnce({
      getAll: () => [],
      set: vi.fn(() => { throw new Error('cannot set cookies here') }),
    } as never)
    const { createClient } = await import('@/lib/supabase/server')
    const { createServerClient } = await import('@supabase/ssr')
    await createClient()
    const passedOptions = vi.mocked(createServerClient).mock.calls.at(-1)![2] as { cookies: { setAll: (arg: unknown) => void } }
    expect(() => passedOptions.cookies.setAll([{ name: 'a', value: 'b', options: {} }])).not.toThrow()
  })
})
```

- [ ] **Step 5: Run all four new test files**

Run: `npm test -- src/__tests__/components/auth/ConstellationField.test.tsx src/__tests__/components/editor/extensions/slash-items.test.ts src/__tests__/lib/supabase/client.test.ts src/__tests__/lib/supabase/server.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/components/auth/ConstellationField.test.tsx src/__tests__/components/editor/extensions/slash-items.test.ts src/__tests__/lib/supabase/client.test.ts src/__tests__/lib/supabase/server.test.ts
git commit -m "test: add Tier C smoke tests for ConstellationField, slash-items, and supabase client factories"
```

---

## Task 27: Full-suite verification and coverage check

**Files:**
- None created/modified (verification-only task; may touch any test file above if the coverage run reveals a genuine remaining gap in a Tier A file).

**Interfaces:**
- N/A

- [ ] **Step 1: Run the full unit/integration suite**

Run: `npm test`
Expected: all tests pass (existing + all added in Tasks 1-21, 26).

- [ ] **Step 2: Run the coverage report and check Tier A files**

Run: `npx vitest run --coverage`
Expected: each of the 10 Tier A files listed in Global Constraints shows 100% branch coverage. If any still shows an uncovered branch, add one targeted test for that exact branch in its existing test file (following the same mocking pattern already used in that file) and re-run.

- [ ] **Step 3: Check Tier B files are at or near ~95%+**

Inspect the same coverage report for the 11 Tier B files. For any file below ~95% where the remaining gap is a genuinely untestable defensive guard (per Global Constraints), leave it — do not chase it. For any gap that is a real, reachable branch, add one targeted test.

- [ ] **Step 4: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: all specs pass, including the four new ones from Tasks 22-25.

- [ ] **Step 5: Confirm the bug-report artifact is complete**

Read `docs/testing-report-2026-08-28.md` and confirm it has one entry per `// BUG:` comment added across Tasks 2, 3, and 7 (6 entries total: 2 from workspaces.ts, 1 from graph/query.ts, 3 from todos.ts).

- [ ] **Step 6: Commit any final targeted gap-fill tests from Steps 2-3**

```bash
git add -A
git commit -m "test: close remaining Tier A/B coverage gaps found by the final coverage run"
```
