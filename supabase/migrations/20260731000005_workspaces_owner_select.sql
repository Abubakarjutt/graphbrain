-- Let a workspace owner always see their own workspace.
--
-- The original policy (migration 20260729000002) was:
--   workspaces_select using (is_workspace_member(id))
--
-- That creates a bootstrap chicken-and-egg: when a new user creates their
-- first workspace via `insert(...).select()`, PostgREST issues
-- `INSERT ... RETURNING`, and RETURNING requires the new row to pass the
-- SELECT policy. But the membership row is created *after* the workspace, so
-- `is_workspace_member(id)` is false at that instant and the insert is
-- rejected with "new row violates row-level security policy". The user then
-- gets bounced back to /login — the symptom reported as "login not working".
--
-- Owning a workspace is sufficient reason to read it, so add owner_id to the
-- SELECT policy. This also removes the ordering dependency during bootstrap.

drop policy "workspaces_select" on workspaces;
create policy "workspaces_select" on workspaces
  for select using (owner_id = auth.uid() or is_workspace_member(id));
