ALTER TABLE files
  ADD COLUMN extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'done', 'error', 'none'));
