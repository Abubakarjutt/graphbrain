-- The "files" Storage bucket was never created, and RLS is enabled by default
-- on storage.objects with no policies defined -- so every upload/download/delete
-- was denied ("new row violates row-level security policy") regardless of
-- workspace membership.
--
-- Object paths are `${workspaceId}/${pageId}/${filename}` (see getUploadUrl in
-- src/lib/actions/files.ts), so membership is checked against the first path
-- segment via storage.foldername(name).

insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

create policy "files_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'files'
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

create policy "files_storage_select" on storage.objects
  for select using (
    bucket_id = 'files'
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

create policy "files_storage_update" on storage.objects
  for update using (
    bucket_id = 'files'
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

create policy "files_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'files'
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );
