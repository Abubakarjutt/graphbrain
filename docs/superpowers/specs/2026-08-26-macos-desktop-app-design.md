# macOS Desktop App (Electron Shell)

**Date:** 2026-08-26
**Status:** Draft

---

## Overview

Wrap the existing Next.js app in an Electron shell that bundles and runs a real, local Next.js production server (self-hosted standalone build), rather than a static export or a thin webview pointing at a hosted URL. This is required because the app depends on features that only work under a live Node server:

- `src/proxy.ts` (this fork's renamed `middleware.ts`) enforces auth redirects per-request and cannot run under static export.
- Server Actions (`src/lib/actions/*.ts`) read/write via a cookie-scoped Supabase client created per-request.
- `src/app/api/query/ask/route.ts` is a live API route (AI query endpoint).

The app is not deployed anywhere today and isn't going to be — the desktop build is the only distribution path. Supabase itself remains a remote/cloud service; only the Next.js server and UI run locally inside the packaged app.

Because the packaged app **will be distributed to other people**, it must never ship `SUPABASE_SERVICE_ROLE_KEY` — a service-role key baked into a distributed binary is extractable by anyone who receives it, granting full RLS-bypassing database access. Part of this work replaces all five `createAdminClient()` call sites with `SECURITY DEFINER` Postgres RPC functions, removing the service-role key dependency from the codebase entirely (web app included — this is a strict security improvement, not just a desktop workaround).

---

## Approaches Considered

| Approach | Verdict |
|---|---|
| **A. Electron spawns a bundled Next standalone server as a child process, loads `http://127.0.0.1:<port>`** | **Chosen.** Matches Next's documented self-hosting path exactly; zero changes to app code — proxy, Server Actions, and API routes all keep working unmodified. |
| B. Run Next's request handler in-process inside Electron's main process (custom server) | Rejected — Next's own docs steer away from custom servers unless required; a crash in the handler would take Electron's main process down with it, vs. an isolated child process. |
| C. Deploy the web app (e.g. Vercel) and make Electron a thin shell pointing at the hosted URL | Rejected for now — explicitly not deploying; would add an ongoing hosting dependency. Revisit later: Approach A's shell can point at a URL instead of localhost with a one-line change if this changes. |

---

## Architecture

### Build output: Next `standalone` mode

A bare `spawn('next', ['start', ...])` relies on a globally-installed `next` CLI on `PATH` — a distributed `.app` has no such thing, and copying full `node_modules` verbatim (as an earlier draft of this spec did) bloats install size and notarization time for no benefit. Instead, `next.config.ts` gains `output: 'standalone'`, which is Next's own documented mode for exactly this situation: `next build` produces `.next/standalone/server.js` plus only the `node_modules` actually required to run it, pruned to size. The build step additionally copies `.next/static` → `.next/standalone/.next/static` and `public/` → `.next/standalone/public` (standalone output doesn't include these automatically — this is a documented, required manual step). The entire `.next/standalone` directory is what gets bundled and run; nothing else needs packaging.

### Runtime

```
Electron main process (electron/main.ts)
  1. app.whenReady()
  2. port = findFreePort()                         // bind :0, read assigned port, close
  3. spawn(process.execPath, ['server.js'], {
       cwd: path.join(resourcesPath, 'standalone'),
       env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), HOSTNAME: '127.0.0.1' },
     })
     // ELECTRON_RUN_AS_NODE makes Electron's own bundled binary behave as a
     // plain Node runtime for this child process — no separate Node install
     // needed on the end user's machine. `server.js` reads PORT/HOSTNAME from
     // env directly (this is how Next's standalone server is documented to
     // be configured — no CLI flags).
  4. poll http://127.0.0.1:<port> until 200 or timeout (~15s)
       - on timeout: show error dialog, quit
  5. new BrowserWindow().loadURL(`http://127.0.0.1:${port}`)
  6. on 'before-quit' / 'window-all-closed': child.kill('SIGTERM')
       - fallback SIGKILL after 3s if still alive
```

`electron/preload.ts` stays minimal — `contextIsolation: true`, `nodeIntegration: false`. The renderer just loads the existing web UI as-is; no native IPC bridge is needed for v1 (no menu-triggered app actions exist yet).

Auth works identically to the browser deployment: the standalone server is a real HTTP server, so Supabase SSR's cookie-based session and `proxy.ts`'s redirect logic behave exactly as they do today — nothing about "local" changes the request/response cycle (see Known Limitations for one caveat this inherits, not introduces).

---

## Security Migration: Removing the Service-Role Key

### Current call sites (`createAdminClient()` in `src/lib/supabase/admin.ts`)

Five call sites across four locations — all must move off the admin client, or `admin.ts` can't actually be deleted:

| Site | Why admin was used |
|---|---|
| `src/app/(auth)/invite/[token]/page.tsx:15` | Invitee has no RLS access to their own invite row before accepting |
| `src/lib/actions/workspaces.ts:56` (`acceptInvite`) | Same — invitee isn't yet a workspace member |
| `src/lib/actions/workspaces.ts:130-131` (`getWorkspaceDetails`) | `admin.auth.admin.listUsers()` to resolve member emails |
| `src/lib/actions/todos.ts:89-90` (`getTodoBoard`) | `admin.auth.admin.listUsers()` to resolve assignee emails |
| `src/lib/actions/todos.ts:362-363` (`getTimeReport`) | `admin.auth.admin.listUsers()` to resolve assignee emails |

### Replacement: `SECURITY DEFINER` RPC functions

New migration `supabase/migrations/20260826000001_workspace_invite_rpcs.sql`:

The real `workspace_invites` table (`supabase/migrations/20260807000001_workspace_invites.sql`) has columns `id, workspace_id, invited_email, invited_by, role, token, accepted_at, created_at` — **no `expires_at`**. Invites don't expire today; adding expiry would be new scope beyond what this migration needs, so the functions below match current behavior exactly rather than inventing an expiry column.

```sql
-- Read-only invite lookup by token (unauthenticated-safe: only non-sensitive
-- columns). Deliberately does NOT filter out already-accepted invites — the
-- invite page needs to distinguish "already used" from "invalid/unknown" to
-- show the right message, so `accepted_at` is returned, not filtered on.
CREATE FUNCTION get_invite_by_token(p_token uuid)
RETURNS TABLE (workspace_id uuid, workspace_name text, invited_email text, role text, accepted_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.name, i.invited_email, i.role, i.accepted_at
  FROM workspace_invites i JOIN workspaces w ON w.id = i.workspace_id
  WHERE i.token = p_token
$$;

-- Atomic accept: validates token + accepting user's email matches the invite,
-- inserts membership (idempotent), marks accepted
CREATE FUNCTION accept_workspace_invite(p_token uuid)
RETURNS uuid  -- returns workspace_id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite workspace_invites;
  v_caller_email text;
BEGIN
  SELECT * INTO v_invite FROM workspace_invites
    WHERE token = p_token AND accepted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_invite'; END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS DISTINCT FROM v_invite.invited_email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id)
    VALUES (v_invite.workspace_id, auth.uid())
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  UPDATE workspace_invites SET accepted_at = now() WHERE token = p_token;
  RETURN v_invite.workspace_id;
END;
$$;

-- Member email resolution, scoped to workspaces the CALLER belongs to
CREATE FUNCTION get_workspace_member_emails(p_workspace_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email FROM auth.users u
  JOIN workspace_members m ON m.user_id = u.id
  WHERE m.workspace_id = p_workspace_id
    AND is_workspace_member(p_workspace_id)  -- caller check, existing helper
$$;

GRANT EXECUTE ON FUNCTION get_invite_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_workspace_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_workspace_member_emails(uuid) TO authenticated;

-- Pre-existing helper (supabase/migrations/20260729000002_rls_policies.sql)
-- is SECURITY DEFINER without search_path hardening; bring it in line with
-- the standard this migration establishes for every other DEFINER function.
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  )
$$;
```

Each function checks caller authorization *inside the body* (never relies on `SECURITY DEFINER` alone for safety). `accept_workspace_invite` now also verifies the accepting user's email matches the invite (closing a pre-existing gap where any authenticated holder of a leaked token could accept someone else's invite) and is idempotent against a user who's already a member re-accepting a second valid invite (`ON CONFLICT DO NOTHING`, matching the current code's explicit existence check it replaces).

### Code changes

- `src/app/(auth)/invite/[token]/page.tsx`: replace `createAdminClient()` lookup with `supabase.rpc('get_invite_by_token', { p_token: token }).maybeSingle()` (token is unique, so at most one row; `.maybeSingle()` returns `null` data rather than erroring when no invite matches).
- `src/lib/actions/workspaces.ts`: `acceptInvite` uses `supabase.rpc('accept_workspace_invite', ...)`; `getWorkspaceDetails` uses `supabase.rpc('get_workspace_member_emails', ...)`.
- `src/lib/actions/todos.ts`: **both** `getTodoBoard` and `getTimeReport` use `supabase.rpc('get_workspace_member_emails', ...)`.
- Delete `src/lib/supabase/admin.ts` once all five call sites above are migrated (grep for `createAdminClient` to confirm zero remaining references before deleting).
- Remove `SUPABASE_SERVICE_ROLE_KEY` from `.env.example` and any deployment docs.

---

## Packaging & Distribution

`electron-builder.yml`:

```yaml
appId: com.graphbrain.desktop
productName: GraphBrain
directories:
  buildResources: build
files:
  - electron/dist/**/*
extraResources:
  # Everything the standalone server needs is already self-contained here —
  # see "Build output: Next `standalone` mode" above. No separate
  # node_modules/public/.next copy: standalone bundling supersedes it.
  - from: .next/standalone
    to: standalone
mac:
  category: public.app-category.productivity
  target: [dmg]
  hardenedRuntime: true
  # signing/notarization only activate if these env vars are set — no code
  # changes needed once an Apple Developer account is available:
  # CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
```

No icon asset is available yet — `build/icon.icns` is a placeholder (Electron's default icon) until one is provided; swapping it later is a config-only change (`mac.icon` path), not a design change.

**Signing risk — must be verified, not assumed.** Without signing/notarization env vars set, `electron-builder` applies an ad-hoc signature by default on modern versions, but on Apple Silicon (the majority of Macs today) an executable with no signature at all can fail to launch outright, not merely trigger a Gatekeeper warning dialog. Since this build **will** be handed to other people, part of the v1 acceptance criteria (see Testing) is running the produced DMG on a clean Apple Silicon Mac that has never had the repo/toolchain on it, and confirming it actually opens (via right-click → Open) rather than assuming that outcome. Once an Apple Developer account is enrolled, setting the signing env vars above and rebuilding replaces the ad-hoc signature with a real one — no code changes needed.

Auto-update is explicitly out of scope for v1 (no existing hosting for an update feed, and YAGNI until there's a real release cadence).

**Release build secrets.** The distributable is built once, on the developer's machine, from a `.env.production` (git-ignored, not `.env.example`) containing the real `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` for whichever Supabase project the distributed app should talk to — `next build` inlines these into the standalone output at build time, so every installed copy of the app is permanently pointed at that one project. This is intentional (all recipients share one backend) but worth stating explicitly since nothing else in this spec names where the build gets its real values from.

---

## File Map

| Action | Path |
|---|---|
| Create | `electron/main.ts` |
| Create | `electron/preload.ts` |
| Create | `electron/findFreePort.ts` |
| Create | `electron-builder.yml` |
| Create | `supabase/migrations/20260826000001_workspace_invite_rpcs.sql` |
| Modify | `next.config.ts` — add `output: 'standalone'` |
| Modify | `package.json` — add `electron`, `electron-builder`, `concurrently`, `wait-on` devDeps; add `electron:dev`, `build:desktop` scripts (the latter runs `next build` then copies `.next/static` → `.next/standalone/.next/static` and `public/` → `.next/standalone/public` before invoking `electron-builder`) |
| Modify | `src/app/(auth)/invite/[token]/page.tsx` — use `get_invite_by_token` RPC |
| Modify | `src/lib/actions/workspaces.ts` — `acceptInvite` uses `accept_workspace_invite` RPC; `getWorkspaceDetails` uses `get_workspace_member_emails` RPC |
| Modify | `src/lib/actions/todos.ts` — both `getTodoBoard` and `getTimeReport` use `get_workspace_member_emails` RPC |
| Delete | `src/lib/supabase/admin.ts` |
| Modify | `.env.example` — remove `SUPABASE_SERVICE_ROLE_KEY` |
| Create | `.env.production` (git-ignored, not committed) — real Supabase project values used only when building the distributable |
| Modify | `src/__tests__/lib/actions/workspaces.test.ts`, `src/__tests__/lib/actions/todos.test.ts` — mock `supabase.rpc` instead of `createAdminClient` for all five migrated call sites |

---

## Error Handling

| Scenario | Handling |
|---|---|
| Bundled Next server fails to start (port bind failure, missing `.next`) | Health-check poll times out after ~15s → error dialog shown → app quits cleanly |
| Chosen port becomes unavailable between selection and spawn (race) | The standalone server fails fast (EADDRINUSE); treated same as startup timeout above — retry with a fresh port once, then error dialog |
| Electron quits while Next child is still starting | Child process killed on `before-quit` regardless of readiness state |
| `accept_workspace_invite` called with an already-used/invalid token | Function raises `invalid_invite`; caller (existing action) surfaces this as the same "invalid invite" UI state used today |
| `accept_workspace_invite` called by a user whose email doesn't match the invite | Function raises `invite_email_mismatch`; surfaced as a distinct "this invite isn't for your account" message rather than the generic invalid-invite state |
| `accept_workspace_invite` called by a user who is already a member | `ON CONFLICT DO NOTHING` — succeeds idempotently, invite still marked accepted |
| `get_workspace_member_emails` called by a non-member | `is_workspace_member()` check fails inside the function → empty result set, no error leak about workspace existence |
| Bundled standalone server's `server.js` missing at expected `resourcesPath/standalone` path (packaging bug) | `spawn` emits an `error` event before any health-check polling; caught and surfaced as the same startup error dialog as a health-check timeout |

---

## Testing

- Existing Vitest/Playwright suites are untouched — they test the web app, not the Electron shell.
- Extend `src/__tests__/lib/actions/workspaces.test.ts` and `src/__tests__/lib/actions/todos.test.ts`: mock `supabase.rpc` instead of `createAdminClient`; verify the invite accept/lookup and member-email flows call the right RPC names with the right args.
- Delete any test coverage that directly exercised `createAdminClient`/`admin.ts` (file is removed).
- Acceptance for the Electron shell itself (v1, manual — no automated Electron E2E yet, noted as future work): launch the packaged `.app`, confirm login, an authenticated page load, and the full invite-accept flow all work end-to-end against the real Supabase project.
- **Signing verification (required before calling v1 done, per the signing-risk note in Packaging & Distribution above):** copy the built DMG to a Mac that has never had this repo or dev toolchain on it (or a clean VM), and confirm it actually launches via right-click → Open. Don't assume ad-hoc signing is sufficient — test it.

---

## Known Limitations (inherited, not introduced by this work)

- `proxy.ts` calls `supabase.auth.getUser()` — a network round-trip to Supabase — on every navigation to decide the login redirect. The desktop app inherits this exactly as the web app has it today: a network blip while using the desktop app can still bounce the user to `/login` even though the app itself is running locally. This spec doesn't change that behavior; flagging it here so it isn't mistaken for a desktop-specific bug later.

---

## Out of Scope (v1)

- Auto-update
- Code signing/notarization (config supports it, not yet exercised — no Apple Developer account yet)
- Custom app icon (placeholder only)
- Windows/Linux builds (macOS only, per the request)
- Native menu bar / IPC-driven app actions
