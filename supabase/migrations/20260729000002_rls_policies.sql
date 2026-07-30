-- Enable RLS on all tables
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table pages enable row level security;
alter table blocks enable row level security;
alter table files enable row level security;
alter table databases enable row level security;
alter table database_rows enable row level security;
alter table nodes enable row level security;
alter table edges enable row level security;
alter table query_logs enable row level security;

-- Helper: check membership (used in policies, avoids N+1)
create or replace function is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

-- Workspaces
create policy "workspaces_select" on workspaces
  for select using (is_workspace_member(id));
create policy "workspaces_insert" on workspaces
  for insert with check (owner_id = auth.uid());
create policy "workspaces_update" on workspaces
  for update using (owner_id = auth.uid());
create policy "workspaces_delete" on workspaces
  for delete using (owner_id = auth.uid());

-- Workspace members
create policy "members_select" on workspace_members
  for select using (is_workspace_member(workspace_id));
create policy "members_insert" on workspace_members
  for insert with check (
    exists (select 1 from workspaces where id = workspace_id and owner_id = auth.uid())
    or user_id = auth.uid()
  );
create policy "members_delete" on workspace_members
  for delete using (
    exists (select 1 from workspaces where id = workspace_id and owner_id = auth.uid())
  );

-- Pages
create policy "pages_select" on pages
  for select using (is_workspace_member(workspace_id));
create policy "pages_insert" on pages
  for insert with check (is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "pages_update" on pages
  for update using (is_workspace_member(workspace_id));
create policy "pages_delete" on pages
  for delete using (is_workspace_member(workspace_id));

-- Blocks
create policy "blocks_select" on blocks
  for select using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "blocks_insert" on blocks
  for insert with check (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "blocks_update" on blocks
  for update using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "blocks_delete" on blocks
  for delete using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );

-- Files
create policy "files_select" on files
  for select using (is_workspace_member(workspace_id));
create policy "files_insert" on files
  for insert with check (is_workspace_member(workspace_id));
create policy "files_delete" on files
  for delete using (is_workspace_member(workspace_id));

-- Databases
create policy "databases_select" on databases
  for select using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "databases_insert" on databases
  for insert with check (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "databases_update" on databases
  for update using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );

-- Database rows
create policy "db_rows_select" on database_rows
  for select using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "db_rows_insert" on database_rows
  for insert with check (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "db_rows_update" on database_rows
  for update using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "db_rows_delete" on database_rows
  for delete using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );

-- Nodes
create policy "nodes_select" on nodes
  for select using (is_workspace_member(workspace_id));
create policy "nodes_insert" on nodes
  for insert with check (is_workspace_member(workspace_id));
create policy "nodes_update" on nodes
  for update using (is_workspace_member(workspace_id));
create policy "nodes_delete" on nodes
  for delete using (is_workspace_member(workspace_id));

-- Edges
create policy "edges_select" on edges
  for select using (is_workspace_member(workspace_id));
create policy "edges_insert" on edges
  for insert with check (is_workspace_member(workspace_id));
create policy "edges_delete" on edges
  for delete using (is_workspace_member(workspace_id));

-- Query logs: user sees only their own logs
create policy "query_logs_select" on query_logs
  for select using (user_id = auth.uid() and is_workspace_member(workspace_id));
create policy "query_logs_insert" on query_logs
  for insert with check (user_id = auth.uid() and is_workspace_member(workspace_id));
