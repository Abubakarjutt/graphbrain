-- IMPORTANT: query_embedding must be vector(768) — matches nomic-embed-text output
-- and the nodes.embedding column dimension. Update both if the model changes.
CREATE OR REPLACE FUNCTION match_nodes(
  query_embedding vector(768),
  match_workspace_id uuid,
  match_count int DEFAULT 10,
  match_database_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  entity_type text,
  entity_id uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT n.id, n.entity_type, n.entity_id,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM nodes n
  WHERE n.workspace_id = match_workspace_id
    AND n.embedding IS NOT NULL
    AND (
      match_database_id IS NULL
      OR n.entity_id IN (
        SELECT dr.id FROM database_rows dr WHERE dr.database_id = match_database_id
        UNION
        SELECT dr.page_id FROM database_rows dr
          WHERE dr.database_id = match_database_id AND dr.page_id IS NOT NULL
      )
    )
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;
