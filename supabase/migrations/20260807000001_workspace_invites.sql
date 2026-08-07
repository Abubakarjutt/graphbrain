create table workspace_invites (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  invited_email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  token uuid not null unique default uuid_generate_v4(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id, invited_email)
);

alter table workspace_invites enable row level security;

-- Workspace owners can view and manage all invites for their workspace
create policy "invites_select" on workspace_invites
  for select using (
    exists (select 1 from workspaces where id = workspace_id and owner_id = auth.uid())
  );

create policy "invites_insert" on workspace_invites
  for insert with check (
    exists (select 1 from workspaces where id = workspace_id and owner_id = auth.uid())
  );

create policy "invites_delete" on workspace_invites
  for delete using (
    exists (select 1 from workspaces where id = workspace_id and owner_id = auth.uid())
  );

create index workspace_invites_token_idx on workspace_invites (token);
create index workspace_invites_workspace_idx on workspace_invites (workspace_id);
