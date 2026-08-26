-- No-op: blocks_insert/blocks_select already exist as of 20260729000002_rls_policies.sql.
-- This migration was written against a stale assumption that they were missing;
-- kept (rather than deleted) since it may already be referenced elsewhere, but
-- guarded with drop-if-exists so it's safe to apply.

drop policy if exists "blocks_insert" on blocks;
create policy "blocks_insert" on blocks
    for insert with check (
        exists (select 1 from pages p where p.id = page_id and is_workspace_member(p.workspace_id))
    );

drop policy if exists "blocks_select" on blocks;
create policy "blocks_select" on blocks
    for select using (
        exists (select 1 from pages p where p.id = page_id and is_workspace_member(p.workspace_id))
    );

