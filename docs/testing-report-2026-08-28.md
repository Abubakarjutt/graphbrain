# Testing Report — 2026-08-28

Bugs discovered while hardening test coverage per
`docs/superpowers/specs/2026-08-28-test-coverage-hardening-design.md`. Each
entry's test asserts today's actual (buggy) behavior — the suite stays
green — and the fix is deferred to a separate follow-up pass.

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
