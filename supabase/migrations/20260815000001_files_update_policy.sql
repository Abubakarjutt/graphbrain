-- The initial RLS migration (20260729000002) defined files_select/insert/delete
-- but no update policy. Server actions use the anon key (RLS-subject), so every
-- `update({ extraction_status: ... })` on `files` silently matched zero rows and
-- uploaded docs/attachments stayed stuck on `pending` forever.
--
-- Mirrors the shape of pages_update in 20260729000002_rls_policies.sql.

create policy "files_update" on files
  for update using (is_workspace_member(workspace_id));
