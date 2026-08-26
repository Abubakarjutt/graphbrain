-- Docs are now database_rows like any other row (see createDatabaseDocPage /
-- NewDocButton), so pages.database_id — the old parallel "doc lives directly
-- on a database" mechanism — is unused. The index drops automatically with
-- the column, but is listed for clarity.

drop index if exists pages_database_id_idx;

alter table pages
  drop column if exists database_id;
