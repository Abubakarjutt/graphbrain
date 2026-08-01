-- The blocks.content column stores each node's full Tiptap JSON, so blocks.type
-- is redundant metadata. The fixed enum rejected Tiptap node names (paragraph,
-- heading, bulletList, …), so page bodies never persisted. Drop the constraint.
alter table blocks drop constraint if exists blocks_type_check;
