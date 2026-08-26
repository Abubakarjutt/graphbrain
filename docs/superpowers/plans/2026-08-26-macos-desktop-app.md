# macOS Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Next.js web app as a distributable macOS Electron app, eliminating the service-role Supabase key from the shipped binary by replacing all `createAdminClient()` call sites with narrowly-scoped `SECURITY DEFINER` Postgres RPCs.

**Architecture:** Electron's main process spawns the app's `next build`-produced standalone `server.js` as a child Node process (via `ELECTRON_RUN_AS_NODE`, so no separate Node install is required on the end user's machine), polls it until it responds, then opens a `BrowserWindow` pointed at `http://127.0.0.1:<port>`. Because the packaged app must never carry a service-role key, the three admin-client use cases (invite lookup/accept, member email resolution) move server-side into Postgres functions that check caller authorization internally.

**Tech Stack:** Next.js 16.2.12 (`output: 'standalone'`), Electron + electron-builder, Supabase Postgres (`SECURITY DEFINER` SQL functions), Vitest + Testing Library (existing conventions).

**Spec:** `docs/superpowers/specs/2026-08-26-macos-desktop-app-design.md`

## Global Constraints

- No `expires_at` concept for invites — `workspace_invites` has no such column; do not add expiry filtering anywhere.
- Every `SECURITY DEFINER` function must include `SET search_path = public` and must check caller authorization inside the function body — never rely on `SECURITY DEFINER` alone.
- The Electron main process must spawn the bundled standalone `server.js` via `process.execPath` with `ELECTRON_RUN_AS_NODE: '1'` — never `spawn('next', ...)` or rely on a global PATH/Node install.
- No code signing/notarization is required for v1; it must be optional and env-var-gated (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`), never a hard build requirement.
- No custom app icon for v1 — electron-builder's default icon is acceptable.
- Follow this repo's `AGENTS.md`: this is a customized Next.js fork — consult `node_modules/next/dist/docs/` before writing any Next-specific config, don't assume training-data APIs.
- Follow existing Vitest conventions: mock `@/lib/supabase/server`'s `createClient` to return `{ auth, from, rpc }`; use the `makeTableResolvers`/`builderFor`/`queueOnce` thenable-builder pattern for `.from()` mocks (see `src/__tests__/lib/actions/todos.test.ts`); test async Server Component pages by calling them as functions and passing the result to `render()` (see `src/__tests__/app/workspacePage.test.tsx`).

---

## Task 1: Add the workspace invite RPC migration

**Files:**
- Create: `supabase/migrations/20260826000001_workspace_invite_rpcs.sql`

**Interfaces:**
- Produces: SQL functions `get_invite_by_token(p_token uuid)`, `accept_workspace_invite(p_token uuid)`, `get_workspace_member_emails(p_workspace_id uuid)`, and a replaced `is_workspace_member(p_workspace_id uuid)` — consumed by Tasks 2, 3, 5, 6, 7 via `supabase.rpc(name, args)`.

- [ ] **Step 1: Write the migration file**

```sql
-- Replaces createAdminClient() usage for workspace invites and member
-- email lookups so the service-role key never needs to ship in the
-- distributed desktop app. Each function checks caller authorization
-- itself; SECURITY DEFINER only grants the privilege to do so.

CREATE FUNCTION get_invite_by_token(p_token uuid)
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  invited_email text,
  role text,
  accepted_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.name, i.invited_email, i.role, i.accepted_at
  FROM workspace_invites i
  JOIN workspaces w ON w.id = i.workspace_id
  WHERE i.token = p_token
$$;

CREATE FUNCTION accept_workspace_invite(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite workspace_invites;
  v_caller_email text;
BEGIN
  SELECT * INTO v_invite FROM workspace_invites
    WHERE token = p_token AND accepted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite';
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS DISTINCT FROM v_invite.invited_email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_invite.workspace_id, auth.uid(), v_invite.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE workspace_invites SET accepted_at = now() WHERE token = p_token;

  RETURN v_invite.workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  )
$$;

CREATE FUNCTION get_workspace_member_emails(p_workspace_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email
  FROM auth.users u
  JOIN workspace_members m ON m.user_id = u.id
  WHERE m.workspace_id = p_workspace_id
    AND is_workspace_member(p_workspace_id)
$$;

GRANT EXECUTE ON FUNCTION get_invite_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_workspace_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_workspace_member_emails(uuid) TO authenticated;
```

- [ ] **Step 2: Apply the migration and verify manually**

Run whatever this repo's existing convention is for applying a new `supabase/migrations/*.sql` file (check `supabase/migrations/` — this project applies them via the Supabase SQL editor or `supabase db push`, matching how prior migrations in this directory were applied). Then verify in the SQL editor:

```sql
select proname from pg_proc where proname in
  ('get_invite_by_token', 'accept_workspace_invite', 'get_workspace_member_emails', 'is_workspace_member');
```
Expected: all four rows returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260826000001_workspace_invite_rpcs.sql
git commit -m "feat: add SECURITY DEFINER RPCs to replace admin-client invite/member lookups"
```

---

## Task 2: Migrate `acceptInvite` to the RPC

**Files:**
- Modify: `src/lib/actions/workspaces.ts:49-89`
- Create: `src/__tests__/lib/actions/workspaces.test.ts`

**Interfaces:**
- Consumes: `accept_workspace_invite(p_token uuid) RETURNS uuid` from Task 1.
- Produces: `acceptInvite(token: string): Promise<{ workspaceId: string }>` (signature unchanged) — consumed by `AcceptInviteClient.tsx` (already exists, no change needed).

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/actions/workspaces.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('acceptInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('You must be signed in to accept an invite.')
  })

  it('calls accept_workspace_invite and returns the workspace id on success', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ws-1', error: null })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    const result = await acceptInvite('tok-1')

    expect(mockRpc).toHaveBeenCalledWith('accept_workspace_invite', { p_token: 'tok-1' })
    expect(result).toEqual({ workspaceId: 'ws-1' })
  })

  it('surfaces a friendly error for an invalid or already-used invite', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_invite' } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('Invite not found. It may have expired or been revoked.')
  })

  it('surfaces a friendly error when the signed-in email does not match the invite', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'invite_email_mismatch' } })
    const { acceptInvite } = await import('@/lib/actions/workspaces')
    await expect(acceptInvite('tok-1')).rejects.toThrow('This invite was sent to a different email address.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- workspaces.test.ts`
Expected: FAIL — `acceptInvite` still calls `createAdminClient()`/`.from()`, never calls `mockRpc`, so the "calls accept_workspace_invite" assertion fails.

- [ ] **Step 3: Replace the implementation**

In `src/lib/actions/workspaces.ts`, replace lines 49-89 (the whole `acceptInvite` function) with:

```ts
export async function acceptInvite(token: string): Promise<{ workspaceId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to accept an invite.')

  const { data: workspaceId, error } = await supabase.rpc('accept_workspace_invite', { p_token: token })

  if (error) {
    if (error.message === 'invalid_invite') throw new Error('Invite not found. It may have expired or been revoked.')
    if (error.message === 'invite_email_mismatch') throw new Error('This invite was sent to a different email address.')
    throw new Error(error.message)
  }

  revalidatePath('/', 'layout')
  return { workspaceId: workspaceId as string }
}
```

Remove the now-unused `import { createAdminClient } from '@/lib/supabase/admin'` line ONLY if nothing else in the file still uses `createAdminClient` — it is still used by `getWorkspaceDetails` at this point, so leave the import in place for now (Task 3 removes that usage too).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- workspaces.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/workspaces.ts src/__tests__/lib/actions/workspaces.test.ts
git commit -m "feat: migrate acceptInvite to accept_workspace_invite RPC"
```

---

## Task 3: Migrate `getWorkspaceDetails` to the RPC

**Files:**
- Modify: `src/lib/actions/workspaces.ts:106-143`
- Modify: `src/__tests__/lib/actions/workspaces.test.ts` (append)

**Interfaces:**
- Consumes: `get_workspace_member_emails(p_workspace_id uuid) RETURNS TABLE(user_id uuid, email text)` from Task 1.
- Produces: `getWorkspaceDetails(workspaceId: string)` return shape unchanged (`{ workspace, members: WorkspaceMember[], invites: WorkspaceInvite[] }`).

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/lib/actions/workspaces.test.ts`:

```ts
function makeTableResolvers() {
  const resolvers: Record<string, ReturnType<typeof vi.fn>> = {}
  function builderFor(table: string) {
    if (!resolvers[table]) resolvers[table] = vi.fn().mockReturnValue({ data: null, error: null })
    const resolver = resolvers[table]
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => builder),
      then: (resolve: (v: unknown) => void) => resolve(resolver()),
    }
    return builder
  }
  return { resolvers, builderFor }
}
const { resolvers, builderFor } = makeTableResolvers()
function queueOnce(table: string, value: unknown) {
  if (!resolvers[table]) resolvers[table] = vi.fn().mockReturnValue({ data: null, error: null })
  resolvers[table].mockReturnValueOnce(value)
}

describe('getWorkspaceDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => builderFor(table))
    for (const key of Object.keys(resolvers)) delete resolvers[key]
  })

  it('resolves member emails via the workspace RPC', async () => {
    queueOnce('workspaces', { data: { id: 'ws-1', name: 'Acme', owner_id: 'u1' }, error: null })
    queueOnce('workspace_members', { data: [{ user_id: 'u1', role: 'owner' }, { user_id: 'u2', role: 'editor' }], error: null })
    mockRpc.mockResolvedValueOnce({
      data: [{ user_id: 'u1', email: 'owner@example.com' }, { user_id: 'u2', email: 'editor@example.com' }],
      error: null,
    })
    queueOnce('workspace_invites', { data: [], error: null })

    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    const result = await getWorkspaceDetails('ws-1')

    expect(mockRpc).toHaveBeenCalledWith('get_workspace_member_emails', { p_workspace_id: 'ws-1' })
    expect(result.members).toEqual([
      { user_id: 'u1', role: 'owner', email: 'owner@example.com' },
      { user_id: 'u2', role: 'editor', email: 'editor@example.com' },
    ])
  })

  it('throws when the workspace does not exist', async () => {
    queueOnce('workspaces', { data: null, error: null })
    const { getWorkspaceDetails } = await import('@/lib/actions/workspaces')
    await expect(getWorkspaceDetails('ghost')).rejects.toThrow('Workspace not found')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- workspaces.test.ts`
Expected: FAIL — current code calls `createAdminClient()` (a real, unmocked `@supabase/supabase-js` client) instead of `mockRpc`, so `mockRpc` is never called and the email-mapping assertion fails.

- [ ] **Step 3: Replace the implementation**

In `src/lib/actions/workspaces.ts`, replace lines 122-134 (the member-resolution block inside `getWorkspaceDetails`) with:

```ts
  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)

  const { data: emailRows } = await supabase.rpc('get_workspace_member_emails', { p_workspace_id: workspaceId })
  const emailById = new Map((emailRows ?? []).map((r: { user_id: string; email: string }) => [r.user_id, r.email]))
  const members: WorkspaceMember[] = (memberRows ?? []).map(m => ({
    user_id: m.user_id,
    role: m.role,
    email: emailById.get(m.user_id) ?? '',
  }))
```

Then remove the now-unused `createAdminClient` import (line 4) — it is no longer used anywhere in this file after this change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- workspaces.test.ts`
Expected: PASS (all 6 tests across both describe blocks)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/workspaces.ts src/__tests__/lib/actions/workspaces.test.ts
git commit -m "feat: migrate getWorkspaceDetails to get_workspace_member_emails RPC"
```

---

## Task 4: Migrate the invite page to `get_invite_by_token`

**Files:**
- Modify: `src/app/(auth)/invite/[token]/page.tsx`
- Create: `src/__tests__/app/auth/invitePage.test.tsx`

**Interfaces:**
- Consumes: `get_invite_by_token(p_token uuid) RETURNS TABLE(workspace_id, workspace_name, invited_email, role, accepted_at)` from Task 1.
- Produces: no change to `AcceptInviteClient` props (`token`, `invitedEmail`, `workspaceName`, `isLoggedIn`, `currentUserEmail`).

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/app/auth/invitePage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockRpc = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/app/(auth)/invite/[token]/AcceptInviteClient', () => ({
  AcceptInviteClient: (props: { invitedEmail: string; workspaceName: string }) => (
    <div data-testid="accept-invite-stub">Accept {props.invitedEmail} into {props.workspaceName}</div>
  ),
}))

function queueInvite(data: unknown) {
  mockRpc.mockReturnValueOnce({ maybeSingle: vi.fn().mockResolvedValue({ data }) })
}

async function renderPage(token = 'tok-1') {
  const mod = await import('@/app/(auth)/invite/[token]/page')
  const InvitePage = mod.default
  const element = await InvitePage({ params: Promise.resolve({ token }) })
  return render(element)
}

describe('InvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('shows an invalid-invite message when the token does not resolve', async () => {
    queueInvite(null)
    await renderPage()

    expect(screen.getByText('Invalid invite')).toBeInTheDocument()
    expect(screen.getByText(/This invite link is invalid or has been revoked/)).toBeInTheDocument()
  })

  it('renders the accept form for a pending invite', async () => {
    queueInvite({ workspace_id: 'ws-1', workspace_name: 'Acme', invited_email: 'a@b.com', role: 'editor', accepted_at: null })
    await renderPage()

    expect(screen.getByText('Join Acme')).toBeInTheDocument()
    expect(screen.getByTestId('accept-invite-stub')).toHaveTextContent('Accept a@b.com into Acme')
  })

  it('shows an already-used message and a link to the app when the invite was already accepted', async () => {
    queueInvite({ workspace_id: 'ws-1', workspace_name: 'Acme', invited_email: 'a@b.com', role: 'editor', accepted_at: '2026-01-01T00:00:00.000Z' })
    await renderPage()

    expect(screen.getByText(/This invite has already been used/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to app' })).toBeInTheDocument()
    expect(screen.queryByTestId('accept-invite-stub')).not.toBeInTheDocument()
  })

  it('queries get_invite_by_token with the route token', async () => {
    queueInvite({ workspace_id: 'ws-1', workspace_name: 'Acme', invited_email: 'a@b.com', role: 'editor', accepted_at: null })
    await renderPage('tok-42')

    expect(mockRpc).toHaveBeenCalledWith('get_invite_by_token', { p_token: 'tok-42' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- invitePage.test.tsx`
Expected: FAIL — current page code calls `createAdminClient()` (real, unmocked) instead of `supabase.rpc(...)`, so `mockRpc` is never called.

- [ ] **Step 3: Replace the implementation**

Replace the full contents of `src/app/(auth)/invite/[token]/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/auth/AuthShell'
import { AcceptInviteClient } from './AcceptInviteClient'
import Link from 'next/link'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()

  const { data: invite } = await supabase
    .rpc('get_invite_by_token', { p_token: token })
    .maybeSingle()

  const { data: { user } } = await supabase.auth.getUser()

  const workspaceName = invite?.workspace_name ?? null

  return (
    <AuthShell
      title={invite ? `Join ${workspaceName}` : 'Invalid invite'}
      subtitle={
        invite
          ? invite.accepted_at
            ? 'This invite has already been used.'
            : `You've been invited as ${invite.role}.`
          : 'This invite link is invalid or has been revoked.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-white/80 underline decoration-indigo-400/60 underline-offset-4 hover:text-white transition-colors">
            Sign in
          </Link>
        </>
      }
    >
      {invite && !invite.accepted_at ? (
        <AcceptInviteClient
          token={token}
          invitedEmail={invite.invited_email}
          workspaceName={workspaceName ?? ''}
          isLoggedIn={!!user}
          currentUserEmail={user?.email ?? null}
        />
      ) : (
        <Link href="/"
          className="flex items-center justify-center h-11 w-full rounded-lg text-[0.875rem] font-semibold text-white transition-all"
          style={{ background: 'oklch(0.50 0.13 58)', boxShadow: '0 4px 16px -4px oklch(0.52 0.22 240 / 0.45)' }}>
          Go to app
        </Link>
      )}
    </AuthShell>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- invitePage.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/invite/[token]/page.tsx" src/__tests__/app/auth/invitePage.test.tsx
git commit -m "feat: migrate invite page to get_invite_by_token RPC"
```

---

## Task 5: Migrate `getTodoBoard` assignee resolution to the RPC

**Files:**
- Modify: `src/lib/actions/todos.ts:77-98`
- Modify: `src/__tests__/lib/actions/todos.test.ts:84-113` (existing tests) and append a new test

**Interfaces:**
- Consumes: `get_workspace_member_emails(p_workspace_id uuid)` from Task 1.
- Produces: `getTodoBoard` return shape unchanged (`TodoBoard.assignees: { id: string; email: string }[]`).

- [ ] **Step 1: Update the existing tests and write the new failing test**

In `src/__tests__/lib/actions/todos.test.ts`, the two existing tests inside `describe('getTodoBoard', ...)` (lines 84-113) call `getTodoBoard` without mocking `mockRpc`. After Step 3's implementation change, `getTodoBoard` will call `supabase.rpc(...)` unconditionally, so both tests need a queued RPC response added right before the `getTodoBoard` call. Add this line to both existing `it(...)` blocks, right after the last `queueOnce(...)` call and before `const { getTodoBoard } = await import(...)`:

```ts
      mockRpc.mockResolvedValueOnce({ data: [], error: null })
```

Then add a new test in the same `describe('getTodoBoard', ...)` block:

```ts
    it('resolves assignee emails for workspace members via RPC', async () => {
      queueAccessGranted()
      queueOnce('todo_lists', { data: [], error: null })
      queueOnce('todo_items', {
        data: [{ id: 'item-1', database_id: 'db-1', list_id: 'list-1', title: 'Task', due_date: null, assignee_id: 'u1', attached_page_id: null, created_at: '' }],
        error: null,
      })
      mockRpc.mockResolvedValueOnce({ data: [{ user_id: 'u1', email: 'alice@example.com' }], error: null })

      const { getTodoBoard } = await import('@/lib/actions/todos')
      const board = await getTodoBoard('db-1', 'ws-1')

      expect(mockRpc).toHaveBeenCalledWith('get_workspace_member_emails', { p_workspace_id: 'ws-1' })
      expect(board.assignees).toEqual([{ id: 'u1', email: 'alice@example.com' }])
      expect(board.items[0].assignee).toEqual({ id: 'u1', email: 'alice@example.com' })
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- todos.test.ts`
Expected: FAIL — the new test's `expect(mockRpc).toHaveBeenCalledWith(...)` fails because current code queries `workspace_members` + `createAdminClient()` instead of calling `.rpc(...)`.

- [ ] **Step 3: Replace the implementation**

In `src/lib/actions/todos.ts`, replace lines 77-98 (the member-resolution block, from the `// Fetch workspace member IDs...` comment through the closing `}` of the `if (memberIds.length > 0)` block) with:

```ts
  const { data: memberRows } = await supabase.rpc('get_workspace_member_emails', { p_workspace_id: workspaceId })
  const assigneeList: { id: string; email: string }[] = (memberRows ?? []).map(
    (m: { user_id: string; email: string }) => ({ id: m.user_id, email: m.email })
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- todos.test.ts`
Expected: PASS (all `getTodoBoard` tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/todos.ts src/__tests__/lib/actions/todos.test.ts
git commit -m "feat: migrate getTodoBoard assignee resolution to get_workspace_member_emails RPC"
```

---

## Task 6: Migrate `getTimeReport` and remove `createAdminClient` from `todos.ts`

**Files:**
- Modify: `src/lib/actions/todos.ts:1-5` (imports), `:344-388` (`getTimeReport`)
- Modify: `src/__tests__/lib/actions/todos.test.ts` (append)

**Interfaces:**
- Consumes: `get_workspace_member_emails(p_workspace_id uuid)` from Task 1.
- Produces: `getTimeReport` return shape unchanged (`UserTimeReport[]`).

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `src/__tests__/lib/actions/todos.test.ts`:

```ts
  describe('getTimeReport', () => {
    it('returns an empty array when there are no time entries', async () => {
      queueOnce('time_entries', { data: [], error: null })

      const { getTimeReport } = await import('@/lib/actions/todos')
      const report = await getTimeReport('db-1', 'ws-1', '2026-08-26')

      expect(report).toEqual([])
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('groups entries by user, resolving emails via the workspace member RPC', async () => {
      queueOnce('time_entries', {
        data: [
          { user_id: 'u1', item_id: 'item-1', item_title: 'Task A', duration_ms: 1000 },
          { user_id: 'u1', item_id: 'item-2', item_title: 'Task B', duration_ms: 500 },
          { user_id: 'u2', item_id: 'item-1', item_title: 'Task A', duration_ms: 2000 },
        ],
        error: null,
      })
      mockRpc.mockResolvedValueOnce({
        data: [{ user_id: 'u1', email: 'alice@example.com' }, { user_id: 'u2', email: 'bob@example.com' }],
        error: null,
      })

      const { getTimeReport } = await import('@/lib/actions/todos')
      const report = await getTimeReport('db-1', 'ws-1', '2026-08-26')

      expect(mockRpc).toHaveBeenCalledWith('get_workspace_member_emails', { p_workspace_id: 'ws-1' })
      expect(report[0]).toMatchObject({ userId: 'u2', email: 'bob@example.com', totalMs: 2000 })
      expect(report[1]).toMatchObject({ userId: 'u1', email: 'alice@example.com', totalMs: 1500 })
      expect(report[1].tasks).toEqual([
        { itemId: 'item-1', itemTitle: 'Task A', totalMs: 1000 },
        { itemId: 'item-2', itemTitle: 'Task B', totalMs: 500 },
      ])
    })

    it('falls back to the raw user id when the RPC does not return that member (e.g. removed from workspace)', async () => {
      queueOnce('time_entries', {
        data: [{ user_id: 'u3', item_id: 'item-1', item_title: 'Task A', duration_ms: 100 }],
        error: null,
      })
      mockRpc.mockResolvedValueOnce({ data: [], error: null })

      const { getTimeReport } = await import('@/lib/actions/todos')
      const report = await getTimeReport('db-1', 'ws-1', '2026-08-26')

      expect(report[0]).toMatchObject({ userId: 'u3', email: 'u3' })
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- todos.test.ts`
Expected: FAIL — current `getTimeReport` calls `createAdminClient()` (real, unmocked `@supabase/supabase-js` client hitting undefined env vars), so `mockRpc` is never called and the email-resolution assertions fail.

- [ ] **Step 3: Replace the implementation**

In `src/lib/actions/todos.ts`, replace lines 362-365 (the admin-client block inside `getTimeReport`) with:

```ts
  const { data: memberRows } = await supabase.rpc('get_workspace_member_emails', { p_workspace_id: workspaceId })
  const emailById = new Map((memberRows ?? []).map((m: { user_id: string; email: string }) => [m.user_id, m.email]))
```

Then remove the now-unused `import { createAdminClient } from '@/lib/supabase/admin'` from the top of `src/lib/actions/todos.ts` — after this change nothing in the file uses it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- todos.test.ts`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/todos.ts src/__tests__/lib/actions/todos.test.ts
git commit -m "feat: migrate getTimeReport to get_workspace_member_emails RPC"
```

---

## Task 7: Delete the service-role admin client

**Files:**
- Delete: `src/lib/supabase/admin.ts`
- Modify: `.env.example`

**Interfaces:**
- None — this is pure removal, verified by a grep sweep.

- [ ] **Step 1: Verify no remaining references**

Run: `grep -rn "createAdminClient\|lib/supabase/admin" src/`
Expected: no output (Tasks 2-6 removed every call site and import).

- [ ] **Step 2: Delete the file**

```bash
rm src/lib/supabase/admin.ts
```

- [ ] **Step 3: Remove the service-role key from `.env.example`**

In `.env.example`, delete the line:
```
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — no test imports `src/lib/supabase/admin.ts` after Tasks 2-6.

- [ ] **Step 5: Commit**

```bash
git add -u src/lib/supabase/admin.ts .env.example
git commit -m "chore: remove the service-role admin client (no longer used)"
```

---

## Task 8: Enable Next.js standalone build output

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `.next/standalone/server.js` after `next build` — consumed by Task 11 (`electron/prepare-standalone.mjs`) and Task 12 (`electron/main.ts`).

- [ ] **Step 1: Update the config**

Replace the contents of `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 2: Verify the build produces a standalone server**

Run: `npm run build`
Expected: build succeeds; `.next/standalone/server.js` exists (`ls .next/standalone/server.js`).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — this config change doesn't affect any test-time behavior (Vitest doesn't go through `next build`).

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat: enable Next.js standalone build output for Electron packaging"
```

---

## Task 9: Add `findFreePort` utility with tests

**Files:**
- Create: `electron/findFreePort.ts`
- Create: `src/__tests__/electron/findFreePort.test.ts`

**Interfaces:**
- Produces: `findFreePort(): Promise<number>` — consumed by Task 12 (`electron/main.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/electron/findFreePort.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import net from 'node:net'
import { findFreePort } from '../../../electron/findFreePort'

describe('findFreePort', () => {
  it('resolves a port number that can immediately be bound', async () => {
    const port = await findFreePort()
    expect(typeof port).toBe('number')
    expect(port).toBeGreaterThan(0)

    await new Promise<void>((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => server.close(() => resolve()))
    })
  })

  it('can be called repeatedly without error', async () => {
    const ports = await Promise.all([findFreePort(), findFreePort(), findFreePort()])
    for (const p of ports) expect(p).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- findFreePort.test.ts`
Expected: FAIL with a module-not-found error — `electron/findFreePort.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `electron/findFreePort.ts`:

```ts
import net from 'node:net'

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('Could not determine assigned port')))
      }
    })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- findFreePort.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add electron/findFreePort.ts src/__tests__/electron/findFreePort.test.ts
git commit -m "feat: add findFreePort utility for the Electron main process"
```

---

## Task 10: Exclude `electron/` from the root TypeScript project and add its own tsconfig

**Files:**
- Modify: `tsconfig.json`
- Create: `electron/tsconfig.json`

**Interfaces:**
- Produces: an independently compilable `electron/` TypeScript project (`tsc -p electron/tsconfig.json`) — consumed by Task 12's build/dev scripts.

- [ ] **Step 1: Exclude `electron/` from the root tsconfig**

In `tsconfig.json`, change:

```json
  "exclude": ["node_modules"]
```

to:

```json
  "exclude": ["node_modules", "electron"]
```

This prevents the root Next.js TypeScript project (DOM-lib, bundler resolution, `noEmit`) from also trying to type-check the Electron main-process code, which needs Node-only `lib`/`module` settings and must actually emit JS.

- [ ] **Step 2: Create the Electron tsconfig**

Create `electron/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["*.ts"]
}
```

- [ ] **Step 3: Verify it compiles the file from Task 9**

Run: `npx tsc -p electron/tsconfig.json`
Expected: succeeds, producing `electron/dist/findFreePort.js`.

- [ ] **Step 4: Add the build output directory to `.gitignore`**

In `.gitignore`, add a new section:

```
# electron desktop build output
/electron/dist
/release
```

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json electron/tsconfig.json .gitignore
git commit -m "chore: scope electron/ to its own TypeScript project"
```

---

## Task 11: Add the standalone-output preparation script

**Files:**
- Create: `electron/prepare-standalone.mjs`

**Interfaces:**
- Consumes: `.next/standalone/`, `.next/static/`, `public/` (produced by `next build` from Task 8).
- Produces: a fully self-contained `.next/standalone/` directory (with `.next/static` and `public` copied in) — consumed by Task 13's `build:desktop` script and Task 12's `main.ts` at runtime.

- [ ] **Step 1: Write the script**

Create `electron/prepare-standalone.mjs`:

```js
import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const standaloneDir = path.join(root, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  throw new Error('.next/standalone not found — did next build run with output: "standalone" configured?')
}

cpSync(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'), { recursive: true })
cpSync(path.join(root, 'public'), path.join(standaloneDir, 'public'), { recursive: true })

console.log('Copied .next/static and public/ into .next/standalone for the Electron build.')
```

- [ ] **Step 2: Verify it runs against a real build**

Run: `npm run build && node electron/prepare-standalone.mjs`
Expected: prints the success message; `.next/standalone/.next/static` and `.next/standalone/public` both exist (`ls .next/standalone/.next/static .next/standalone/public`).

- [ ] **Step 3: Commit**

```bash
git add electron/prepare-standalone.mjs
git commit -m "feat: add script to copy static assets into the Next standalone build"
```

---

## Task 12: Add the Electron main process

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`

**Interfaces:**
- Consumes: `findFreePort()` from Task 9; `.next/standalone/server.js` from Tasks 8/11 (at `process.resourcesPath/standalone/server.js` when packaged).
- Produces: the app's entry point, referenced by `package.json`'s `"main"` field in Task 13.

No automated test for this task — per the spec's Testing section, the Electron shell itself is verified manually (Task 14), since importing `electron`'s `app`/`BrowserWindow` outside the real Electron binary does not provide a usable API surface to mock meaningfully.

- [ ] **Step 1: Write the preload script**

Create `electron/preload.ts`:

```ts
// Intentionally empty — v1 loads the existing web UI as-is with no native
// IPC bridge (contextIsolation stays on, nodeIntegration stays off).
export {}
```

- [ ] **Step 2: Write the main process**

Create `electron/main.ts`:

```ts
import { app, BrowserWindow, dialog } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import { findFreePort } from './findFreePort'

let serverProcess: ChildProcess | null = null

function killServer() {
  if (!serverProcess) return
  const proc = serverProcess
  serverProcess = null
  proc.kill('SIGTERM')
  setTimeout(() => {
    if (!proc.killed) proc.kill('SIGKILL')
  }, 3000)
}

async function waitForServer(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}`)
      if (res.status) return
    } catch {
      // server not up yet — retry until the deadline
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`Server did not respond within ${timeoutMs}ms`)
}

function openWindow(url: string) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadURL(url)
}

async function startServerAndWindow() {
  const devUrl = process.env.ELECTRON_DEV_SERVER_URL
  if (devUrl) {
    openWindow(devUrl)
    return
  }

  const port = await findFreePort()
  const standaloneDir = path.join(process.resourcesPath, 'standalone')

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
  })

  serverProcess.on('error', (err) => {
    dialog.showErrorBox('GraphBrain failed to start', err.message)
    app.quit()
  })

  try {
    await waitForServer(port)
  } catch (err) {
    dialog.showErrorBox('GraphBrain failed to start', (err as Error).message)
    app.quit()
    return
  }

  openWindow(`http://127.0.0.1:${port}`)
}

app.whenReady().then(startServerAndWindow)

app.on('window-all-closed', () => {
  killServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', killServer)
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -p electron/tsconfig.json`
Expected: succeeds, producing `electron/dist/main.js` and `electron/dist/preload.js`.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat: add Electron main process that spawns the bundled Next server"
```

---

## Task 13: Wire up npm scripts, dependencies, and electron-builder config

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`

**Interfaces:**
- Produces: `npm run electron:dev` (iterate against `next dev`), `npm run build:desktop` (produce a packaged `.dmg`/`.app` under `/release`).

- [ ] **Step 1: Add devDependencies**

In `package.json`, add to `"devDependencies"`:

```json
    "concurrently": "^9.0.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "wait-on": "^8.0.0",
```

Run: `npm install`
Expected: installs successfully; exact resolved versions in `package-lock.json` are not load-bearing.

- [ ] **Step 2: Add scripts and the `main` entry point**

In `package.json`, add `"main": "electron/dist/main.js"` at the top level, and add to `"scripts"`:

```json
    "electron:dev": "concurrently -k \"next dev\" \"wait-on http://localhost:3000 && tsc -p electron/tsconfig.json && ELECTRON_DEV_SERVER_URL=http://localhost:3000 electron electron/dist/main.js\"",
    "build:desktop": "next build && node electron/prepare-standalone.mjs && tsc -p electron/tsconfig.json && electron-builder --mac"
```

- [ ] **Step 3: Write the electron-builder config**

Create `electron-builder.yml`:

```yaml
appId: com.graphbrain.desktop
productName: GraphBrain
directories:
  buildResources: electron/build
  output: release
files:
  - electron/dist/**/*
  - package.json
extraResources:
  - from: .next/standalone
    to: standalone
mac:
  category: public.app-category.productivity
  target: dmg
  # Signing/notarization are optional for v1 and only activate when these
  # env vars are set: CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID,
  # APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID. Without them, electron-builder
  # produces an ad-hoc-signed build — verify it actually launches on a clean
  # Apple Silicon Mac before distributing (see Task 14); do not assume.
```

- [ ] **Step 4: Verify `electron:dev` launches the app against `next dev`**

Run: `npm run electron:dev`
Expected: a GraphBrain window opens showing the running `next dev` app at `http://localhost:3000`. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "feat: add Electron dev/build scripts and electron-builder config"
```

---

## Task 14: Manual acceptance — packaged build

This task has no automated test; it is the spec's required manual verification before this feature can be considered done.

- [ ] **Step 1: Build the packaged app**

Run: `npm run build:desktop`
Expected: completes without error; `release/GraphBrain-*.dmg` (or the `.app` under `release/mac*/`) exists.

- [ ] **Step 2: Launch the packaged app on a clean Apple Silicon Mac (or Gatekeeper-reset test machine)**

Mount the `.dmg`, drag the app to Applications, launch it. Since v1 has no paid code signing, expect (and confirm) a Gatekeeper warning on first launch — right-click → Open to bypass it once. **This step must actually be performed on real hardware**; do not assume success from a clean `electron-builder` exit code, since an unsigned/incorrectly-signed binary can fail to launch outright on Apple Silicon rather than merely showing a warning.

- [ ] **Step 3: Exercise the golden path**

In the launched app: sign up or log in, create a workspace, send an invite to a second test email, open the invite link in the same app (or a browser pointed at the same local port) and accept it, create a database with a to-do list and an assigned item, and confirm the assignee's email renders correctly (exercises Tasks 2-6's RPC migrations end-to-end).

- [ ] **Step 4: Quit and confirm the child server process exits**

Quit the app (Cmd+Q). Run `ps aux | grep server.js` and confirm no orphaned Node process remains from the spawned standalone server.

- [ ] **Step 5: Record the outcome**

If all steps pass, no commit is needed for this task — it is a verification gate, not a code change. If any step fails, treat it as a bug against the relevant earlier task and fix it there before considering this plan complete.

---

## Self-Review

**1. Spec coverage:**
- Standalone build mode → Task 8. ✓
- Static asset copy into standalone → Task 11. ✓
- Electron main process spawn/poll/window/kill lifecycle → Task 12. ✓
- All 5 `createAdminClient()` call sites (invite page, `acceptInvite`, `getWorkspaceDetails`, `getTodoBoard`, `getTimeReport`) → Tasks 4, 2, 3, 5, 6. ✓
- SQL migration with all 3 RPCs + hardened `is_workspace_member` → Task 1. ✓
- Deletion of `src/lib/supabase/admin.ts` and `.env.example` cleanup → Task 7. ✓
- `electron-builder.yml` with `buildResources`/`output` fixed to avoid the `/build` gitignore collision → Task 13. ✓
- Optional, env-var-gated signing → Task 13 (documented, not implemented — matches "Out of Scope (v1): signing/notarization execution"). ✓
- Manual Apple Silicon launch verification → Task 14. ✓
- Known Limitations (proxy.ts network dependency, getTimeReport's workspace-scoped fallback) → inherited/accepted; the fallback behavior is explicitly tested in Task 6's third test. ✓
- Out of scope items (auto-update, custom icon, Windows/Linux, native IPC/menu) → correctly not present in any task. ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"add error handling" placeholders found in any task; every code step includes full, real content. `main.ts`'s error handling (Step 2 of Task 12) is concrete (`dialog.showErrorBox` + `app.quit()`), matching the spec's Error Handling table rather than being hand-waved.

**3. Type consistency:** `findFreePort(): Promise<number>` (Task 9) is imported and used identically in `electron/main.ts` (Task 12). `get_workspace_member_emails` row shape `{ user_id: string; email: string }` is used consistently across Tasks 3, 5, and 6. `acceptInvite`'s return type `{ workspaceId: string }` (Task 2) matches what `AcceptInviteClient.tsx` already destructures (`const { workspaceId } = await acceptInvite(token)`), so no consumer-side change is needed there. The invite page's RPC row shape (`workspace_id, workspace_name, invited_email, role, accepted_at`) matches the `RETURNS TABLE` columns defined in Task 1 and the fields read in Task 4.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-26-macos-desktop-app.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
