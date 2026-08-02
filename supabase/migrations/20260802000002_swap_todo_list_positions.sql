-- reorderTodoList previously did two sequential UPDATEs to swap two lists'
-- positions. If the second failed after the first succeeded, both rows were
-- left sharing the same position permanently — a silent, persistent
-- corruption the client-side optimistic revert had no way to detect or
-- surface. A single function body executes as one implicit transaction, so
-- this swap is now all-or-nothing.
create or replace function swap_todo_list_positions(id_a uuid, id_b uuid, target_database_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  pos_a integer;
  pos_b integer;
begin
  select position into pos_a from todo_lists where id = id_a and database_id = target_database_id;
  select position into pos_b from todo_lists where id = id_b and database_id = target_database_id;
  if pos_a is null or pos_b is null then
    raise exception 'List not found';
  end if;

  update todo_lists set position = pos_b where id = id_a;
  update todo_lists set position = pos_a where id = id_b;
end;
$$;
