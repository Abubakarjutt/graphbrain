-- Enables safe upsert on nodes: ON CONFLICT (entity_type, entity_id) DO UPDATE
ALTER TABLE nodes
  ADD CONSTRAINT nodes_entity_unique UNIQUE (entity_type, entity_id);

-- Enables idempotent edge creation: ON CONFLICT DO NOTHING
ALTER TABLE edges
  ADD CONSTRAINT edges_unique UNIQUE (source_node_id, target_node_id, relationship_type);
