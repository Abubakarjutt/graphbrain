export type WorkspaceRole = 'owner' | 'editor' | 'viewer'
export type EntityType = 'page' | 'block' | 'file' | 'database_row'
export type RelationshipType = 'mention' | 'backlink' | 'parent_child' | 'manual'
export type BlockType =
  | 'text'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bullet'
  | 'numbered'
  | 'code'
  | 'image'
  | 'file'
  | 'embed'

export interface WorkspaceEntry {
  workspace_id: string
  role: string
  workspaces: { id: string; name: string } | null
}

export interface DatabaseField {
  id: string
  name: string
  type: 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'url'
  options?: string[]
}

export interface QueryLogSource {
  node_id: string
  entity_type: EntityType
  entity_id: string
  title: string
}

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  created_at: string
}

export interface Page {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface Block {
  id: string
  page_id: string
  type: BlockType
  content: Record<string, unknown>
  position: number
  created_at: string
}

export interface FileRecord {
  id: string
  workspace_id: string
  page_id: string | null
  storage_path: string
  mime_type: string
  extracted_text: string | null
  created_at: string
}

export interface Database {
  id: string
  page_id: string
  schema: DatabaseField[]
  created_at: string
}

export interface DatabaseRow {
  id: string
  database_id: string
  fields: Record<string, unknown>
  created_at: string
}

export interface Node {
  id: string
  workspace_id: string
  entity_type: EntityType
  entity_id: string
  embedding: number[] | null
  created_at: string
  updated_at: string
}

export interface Edge {
  id: string
  workspace_id: string
  source_node_id: string
  target_node_id: string
  relationship_type: RelationshipType
  created_at: string
}

export interface QueryLog {
  id: string
  workspace_id: string
  user_id: string
  query: string
  response: string | null
  sources: QueryLogSource[]
  created_at: string
}
