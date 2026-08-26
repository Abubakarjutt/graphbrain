# macOS Desktop App (Electron Shell)

**Date:** 2026-08-26
**Status:** Draft

---

## Overview

Wrap the existing Next.js app in an Electron shell that bundles and runs a real, local Next.js production server (`next start`), rather than a static export or a thin webview pointing at a hosted URL. This is required because the app depends on features that only work under a live Node server:

- `src/proxy.ts` (this fork's renamed `middleware.ts`) enforces auth redirects per-request and cannot run under static export.
- Server Actions (`src/lib/actions/*.ts`) read/write via a cookie-scoped Supabase client created per-request.
- `src/app/api/query/ask/route.ts` is a live API route (AI query endpoint).

The app is not deployed anywhere today and isn't going to be — the desktop build is the only distribution path. Supabase itself remains a remote/cloud service; only the Next.js server and UI run locally inside the packaged app.

Because the packaged app **will be distributed to other people**, it must never ship `SUPABASE_SERVICE_ROLE_KEY` — a service-role key baked into a distributed binary is extractable by anyone who receives it, granting full RLS-bypassing database access. Part of this work replaces the three `createAdminClient()` call sites with `SECURITY DEFINER` Postgres RPC functions, removing the service-role key dependency from the codebase entirely (web app included — this is a strict security improvement, not just a desktop workaround).

---

## Approaches Considered

| Approach | Verdict |
|---|---|
| **A. Electron spawns bundled `next start` as a child process, loads `http://127.0.0.1:<port>`** | **Chosen.** Matches Next's documented self-hosting path exactly; zero changes to app code — proxy, Server Actions, and API routes all keep working unmodified. |
| B. Run Next's request handler in-process inside Electron's main process (custom server) | Rejected — Next's own docs steer away from custom servers unless required; a crash in the handler would take Electron's main process down with it, vs. an isolated child process. |
| C. Deploy the web app (e.g. Vercel) and make Electron a thin shell pointing at the hosted URL | Rejected for now — explicitly not deploying; would add an ongoing hosting dependency. Revisit later: Approach A's shell can point at a URL instead of localhost with a one-line change if this changes. |

---

## Architecture

```
Electron main process (electron/main.ts)
  1. app.whenReady()
  2. port = findFreePort()                         // bind :0, read assigned port, close
  3. spawn('next', ['start', '-p', port, '-H', '127.0.0.1'],
           { cwd: resourcesPath, env: { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ...process.env } })
  4. poll http://127.0.0.1:<port> until 200 or timeout (~15s)
       - on timeout: show error dialog, quit
  5. new BrowserWindow().loadURL(`http://127.0.0.1:${port}`)
  6. on 'before-quit' / 'window-all-closed': child.kill('SIGTERM')
       - fallback SIGKILL after 3s if still alive
```

`electron/preload.ts` stays minimal — `contextIsolation: true`, `nodeIntegration: false`. The renderer just loads the existing web UI as-is; no native IPC bridge is needed for v1 (no menu-triggered app actions exist yet).

Auth works identically to the browser deployment: `next start` is a real HTTP server, so Supabase SSR's cookie-based session and `proxy.ts`'s redirect logic behave exactly as they do today — nothing about "local" changes the request/response cycle.

---

## Security Migration: Removing the Service-Role Key

### Current call sites (`createAdminClient()` in `src/lib/supabase/admin.ts`)

| Site | Why admin was used |
|---|---|
| `src/app/(auth)/invite/[token]/page.tsx` | Invitee has no RLS access to their own invite row before accepting |
| `src/lib/actions/workspaces.ts` (`acceptInvite`) | Same — invitee isn't yet a workspace member |
| `src/lib/actions/workspaces.ts`, `src/lib/actions/todos.ts` | `admin.auth.admin.listUsers()` to resolve member emails |

### Replacement: `SECURITY DEFINER` RPC functions

New migration `supabase/migrations/20260826000001_workspace_invite_rpcs.sql`:

```sql
-- Read-only invite lookup by token (unauthenticated-safe: only non-sensitive columns)
CREATE FUNCTION get_invite_by_token(p_token uuid)
RETURNS TABLE (workspace_id uuid, workspace_name text, invited_email text, expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.name, i.email, i.expires_at
  FROM workspace_invites i JOIN workspaces w ON w.id = i.workspace_id
  WHERE i.token = p_token AND i.accepted_at IS NULL AND i.expires_at > now()
$$;

-- Atomic accept: validates token, inserts membership, marks accepted
CREATE FUNCTION accept_workspace_invite(p_token uuid)
RETURNS uuid  -- returns workspace_id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invite workspace_invites;
BEGIN
  SELECT * INTO v_invite FROM workspace_invites
    WHERE token = p_token AND accepted_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_or_expired_invite'; END IF;

  INSERT INTO workspace_members (workspace_id, user_id)
    VALUES (v_invite.workspace_id, auth.uid());
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
```

Each function checks caller authorization *inside the body* (never relies on `SECURITY DEFINER` alone for safety) — `get_workspace_member_emails` reuses the existing `is_workspace_member()` helper already used by RLS policies elsewhere in the schema.

### Code changes

- `src/app/(auth)/invite/[token]/page.tsx`, `src/lib/actions/workspaces.ts`: replace `createAdminClient()` lookups with `supabase.rpc('get_invite_by_token', ...)` / `supabase.rpc('accept_workspace_invite', ...)`.
- `src/lib/actions/workspaces.ts`, `src/lib/actions/todos.ts`: replace `admin.auth.admin.listUsers()` with `supabase.rpc('get_workspace_member_emails', { p_workspace_id })`.
- Delete `src/lib/supabase/admin.ts`.
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
  - from: .next
    to: .next
  - from: public
    to: public
  - from: node_modules
    to: node_modules
  - from: package.json
    to: package.json
mac:
  category: public.app-category.productivity
  target: [dmg]
  hardenedRuntime: true
  # signing/notarization only activate if these env vars are set — no code
  # changes needed once an Apple Developer account is available:
  # CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
```

No icon asset is available yet — `build/icon.icns` is a placeholder (Electron's default icon) until one is provided; swapping it later is a config-only change (`mac.icon` path), not a design change.

Without signing/notarization env vars set, `electron-builder` produces an ad-hoc/unsigned DMG — Gatekeeper will show "unidentified developer," and users open it via right-click → Open. Once an Apple Developer account is enrolled, setting the env vars above and rebuilding is the only change needed.

Auto-update is explicitly out of scope for v1 (no existing hosting for an update feed, and YAGNI until there's a real release cadence).

---

## File Map

| Action | Path |
|---|---|
| Create | `electron/main.ts` |
| Create | `electron/preload.ts` |
| Create | `electron/findFreePort.ts` |
| Create | `electron-builder.yml` |
| Create | `supabase/migrations/20260826000001_workspace_invite_rpcs.sql` |
| Modify | `package.json` — add `electron`, `electron-builder`, `concurrently`, `wait-on` devDeps; add `electron:dev`, `build:desktop` scripts |
| Modify | `src/app/(auth)/invite/[token]/page.tsx` — use `get_invite_by_token` RPC |
| Modify | `src/lib/actions/workspaces.ts` — use `accept_workspace_invite`/`get_workspace_member_emails` RPCs |
| Modify | `src/lib/actions/todos.ts` — use `get_workspace_member_emails` RPC |
| Delete | `src/lib/supabase/admin.ts` |
| Modify | `.env.example` — remove `SUPABASE_SERVICE_ROLE_KEY` |
| Create | `src/__tests__/lib/actions/workspaces.test.ts` additions for RPC-based invite flow (extend existing file) |

---

## Error Handling

| Scenario | Handling |
|---|---|
| Bundled Next server fails to start (port bind failure, missing `.next`) | Health-check poll times out after ~15s → error dialog shown → app quits cleanly |
| Chosen port becomes unavailable between selection and spawn (race) | `next start` fails fast (EADDRINUSE); treated same as startup timeout above — retry with a fresh port once, then error dialog |
| Electron quits while Next child is still starting | Child process killed on `before-quit` regardless of readiness state |
| `accept_workspace_invite` called with expired/used/invalid token | Function raises `invalid_or_expired_invite`; caller (existing action) surfaces this as the same "invalid invite" UI state used today |
| `get_workspace_member_emails` called by a non-member | `is_workspace_member()` check fails inside the function → empty result set, no error leak about workspace existence |

---

## Testing

- Existing Vitest/Playwright suites are untouched — they test the web app, not the Electron shell.
- Extend `src/__tests__/lib/actions/workspaces.test.ts` and `src/__tests__/lib/actions/todos.test.ts`: mock `supabase.rpc` instead of `createAdminClient`; verify the invite accept/lookup and member-email flows call the right RPC names with the right args.
- Delete any test coverage that directly exercised `createAdminClient`/`admin.ts` (file is removed).
- Acceptance for the Electron shell itself (v1, manual — no automated Electron E2E yet, noted as future work): launch the packaged `.app`, confirm login, an authenticated page load, and the full invite-accept flow all work end-to-end against the real Supabase project.

---

## Out of Scope (v1)

- Auto-update
- Code signing/notarization (config supports it, not yet exercised — no Apple Developer account yet)
- Custom app icon (placeholder only)
- Windows/Linux builds (macOS only, per the request)
- Native menu bar / IPC-driven app actions
