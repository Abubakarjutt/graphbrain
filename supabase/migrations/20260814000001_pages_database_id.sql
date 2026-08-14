ALTER TABLE pages
  ADD COLUMN database_id uuid REFERENCES databases(id) ON DELETE CASCADE;

CREATE INDEX pages_database_id_idx ON pages(database_id) WHERE database_id IS NOT NULL;
