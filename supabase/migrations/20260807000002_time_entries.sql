create table if not exists time_entries (
  id          uuid primary key default gen_random_uuid(),
  item_id     text not null,
  item_title  text not null default '',
  database_id uuid not null references databases(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  started_at  timestamptz not null,
  stopped_at  timestamptz not null,
  duration_ms bigint not null,
  created_at  timestamptz not null default now()
);

alter table time_entries enable row level security;

-- Workspace members can read all entries in their shared workspaces
create policy "workspace members can read time entries"
  on time_entries for select to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = time_entries.workspace_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- Users can only insert their own entries
create policy "users can insert own time entries"
  on time_entries for insert to authenticated
  with check (user_id = auth.uid());
