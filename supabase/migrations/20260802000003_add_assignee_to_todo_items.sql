-- Add assignee column to todo_items to support task assignment
-- This allows workspace members to be assigned to specific tasks in the Kanban board

alter table todo_items
  add column if not null assignee_id uuid references auth.users(id) on delete set null;

create index todo_items_assignee_idx on todo_items (assignee_id);

-- Update RLS policies to support assignee-based filtering
-- Users can see tasks they own, tasks assigned to them, or tasks in their workspaces
create or replace policy "todo_items_select" on todo_items
  for select using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = todo_items.database_id and is_workspace_member(p.workspace_id)
    )
    or assignee_id = auth.uid()
  );

create or replace policy "todo_items_insert" on todo_items
  for insert with check (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );

create or replace policy "todo_items_update" on todo_items
  for update using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
    or assignee_id = auth.uid()
  );

create or replace policy "todo_items_delete" on todo_items
  for delete using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
