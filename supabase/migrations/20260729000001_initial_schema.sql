-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- Workspaces
create table workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Workspace members
create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Pages
create table pages (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references pages(id) on delete set null,
  title text not null default 'Untitled',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Blocks
create table blocks (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid not null references pages(id) on delete cascade,
  type text not null,
  content jsonb not null default '{}',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Files
create table files (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  page_id uuid references pages(id) on delete set null,
  storage_path text not null,
  mime_type text not null,
  extracted_text text,
  created_at timestamptz not null default now()
);

-- Databases
create table databases (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid not null references pages(id) on delete cascade,
  schema jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Database rows
create table database_rows (
  id uuid primary key default uuid_generate_v4(),
  database_id uuid not null references databases(id) on delete cascade,
  fields jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Knowledge graph nodes
create table nodes (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('page', 'block', 'file', 'database_row')),
  entity_id uuid not null,
  embedding vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Knowledge graph edges
create table edges (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_node_id uuid not null references nodes(id) on delete cascade,
  target_node_id uuid not null references nodes(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('mention', 'backlink', 'parent_child', 'manual')),
  created_at timestamptz not null default now()
);

-- Query logs
create table query_logs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  query text not null,
  response text,
  sources jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Indexes
create index nodes_embedding_idx on nodes using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index nodes_workspace_idx on nodes (workspace_id);
create index nodes_entity_idx on nodes (entity_type, entity_id);
create index edges_source_idx on edges (source_node_id);
create index edges_target_idx on edges (target_node_id);
create index edges_workspace_idx on edges (workspace_id);
create index pages_workspace_idx on pages (workspace_id);
create index pages_parent_idx on pages (parent_id);
create index blocks_page_idx on blocks (page_id, position);
create index files_workspace_idx on files (workspace_id);
create index query_logs_workspace_idx on query_logs (workspace_id, created_at desc);
