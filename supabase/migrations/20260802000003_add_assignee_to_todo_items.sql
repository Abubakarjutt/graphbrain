-- Add assignee column to todo_items to support task assignment
-- This allows workspace members to be assigned to specific tasks in the Kanban board

alter table todo_items
  add column IF NOT EXISTS assignee_id uuid references auth.users(id) on delete set null;

create index IF NOT EXISTS todo_items_assignee_idx on todo_items (assignee_id);

-- Note: RLS policies were applied manually via supabase db query CLI
-- todo_items_select, todo_items_insert, todo_items_update, todo_items_delete
-- All updated to support assignee_id filtering
