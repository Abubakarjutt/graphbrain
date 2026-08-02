-- Kanban board for a database: an independent project-management feature.
-- Unlike database_rows (generic schema-driven records optionally linked to a
-- page), a to-do item's identity is its own title/due date — an attached
-- page is optional and incidental, not the row's identity.

create table todo_lists (
  id uuid primary key default uuid_generate_v4(),
  database_id uuid not null references databases(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table todo_items (
  id uuid primary key default uuid_generate_v4(),
  database_id uuid not null references databases(id) on delete cascade,
  list_id uuid not null references todo_lists(id) on delete cascade,
  title text not null,
  due_date date,
  attached_page_id uuid references pages(id) on delete set null,
  created_at timestamptz not null default now()
);

create index todo_lists_database_idx on todo_lists (database_id, position);
create index todo_items_database_idx on todo_items (database_id);
create index todo_items_list_idx on todo_items (list_id);

alter table todo_lists enable row level security;
alter table todo_items enable row level security;

-- Same access pattern as database_rows: membership is derived by joining
-- databases -> pages -> workspace_members, since neither table stores
-- workspace_id directly.
create policy "todo_lists_select" on todo_lists
  for select using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "todo_lists_insert" on todo_lists
  for insert with check (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "todo_lists_update" on todo_lists
  for update using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "todo_lists_delete" on todo_lists
  for delete using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );

create policy "todo_items_select" on todo_items
  for select using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "todo_items_insert" on todo_items
  for insert with check (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "todo_items_update" on todo_items
  for update using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "todo_items_delete" on todo_items
  for delete using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
