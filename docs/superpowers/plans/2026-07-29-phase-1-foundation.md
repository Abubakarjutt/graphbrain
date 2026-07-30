# Graphbrain Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an authenticated Next.js + Supabase app with full DB schema, RLS policies, auth flows (email/password + magic link), auto workspace creation on signup, and a base app shell with sidebar.

**Architecture:** Next.js 14 App Router with route groups: `(auth)` for public routes, `(app)` for protected routes. Supabase middleware validates sessions on every request. Supabase handles auth, Postgres (+ pgvector), and file storage. All tables protected by Row Level Security policies.

**Tech Stack:** Next.js 14 (App Router), TypeScript, TailwindCSS, shadcn/ui, Supabase CLI, `@supabase/ssr`, Vitest, `@testing-library/react`, Playwright

---

## File Structure

```
graphbrain/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json                          # shadcn config
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260729000001_initial_schema.sql
│       └── 20260729000002_rls_policies.sql
└── src/
    ├── middleware.ts                        # Session auth + route protection
    ├── test/
    │   └── setup.ts                        # Vitest global setup
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts                   # Browser Supabase client
    │   │   └── server.ts                   # Server Supabase client
    │   └── types/
    │       └── database.ts                 # TypeScript DB types
    ├── components/
    │   ├── auth/
    │   │   ├── LoginForm.tsx
    │   │   └── SignupForm.tsx
    │   └── layout/
    │       ├── AppShell.tsx
    │       └── Sidebar.tsx
    └── app/
        ├── layout.tsx                      # Root layout
        ├── page.tsx                        # Redirect to /login or /workspace
        ├── (auth)/
        │   ├── login/page.tsx
        │   ├── signup/page.tsx
        │   └── auth/callback/route.ts      # Magic link + OAuth callback
        └── (app)/
            ├── layout.tsx                  # Auth-gated layout with AppShell
            └── workspace/
                └── [workspaceId]/
                    └── page.tsx            # Workspace landing page
```

---

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `components.json`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /Users/Apple/projects/graphbrain
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
```

Expected: Project files created in `/Users/Apple/projects/graphbrain/`

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
npm install -D @playwright/test
```

- [ ] **Step 3: Install and initialize shadcn/ui**

```bash
npx shadcn@latest init --defaults
npx shadcn@latest add button input label
```

- [ ] **Step 4: Create Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 5: Create Vitest setup file**

Create `src/test/setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Create Playwright config**

Create `playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 7: Add test scripts to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 8: Create .env.example**

Create `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

- [ ] **Step 9: Create .env.local from example**

```bash
cp .env.example .env.local
```

Fill in your Supabase project URL and anon key from the Supabase dashboard.

- [ ] **Step 10: Verify dev server starts**

```bash
npm run dev
```

Expected: Server running at `http://localhost:3000` with no errors. Stop with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js project with Supabase, shadcn, Vitest, Playwright"
```

---

### Task 2: Supabase Local Dev Setup

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/20260729000001_initial_schema.sql`

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
```

Expected: `supabase --version` prints a version number.

- [ ] **Step 2: Initialize Supabase project**

```bash
supabase init
```

Expected: `supabase/config.toml` created.

- [ ] **Step 3: Start local Supabase**

```bash
supabase start
```

Expected: Local Supabase running. Note the printed `API URL` and `anon key` — update `.env.local` with these values for local development.

- [ ] **Step 4: Write initial schema migration**

Create `supabase/migrations/20260729000001_initial_schema.sql`:
```sql
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
```

- [ ] **Step 5: Apply migration**

```bash
supabase db push
```

Expected: Migration applied with no errors. Verify in Supabase Studio at `http://localhost:54323` — all tables should appear under Table Editor.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema migration"
```

---

### Task 3: RLS Policies

**Files:**
- Create: `supabase/migrations/20260729000002_rls_policies.sql`

- [ ] **Step 1: Write RLS policies migration**

Create `supabase/migrations/20260729000002_rls_policies.sql`:
```sql
-- Enable RLS on all tables
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table pages enable row level security;
alter table blocks enable row level security;
alter table files enable row level security;
alter table databases enable row level security;
alter table database_rows enable row level security;
alter table nodes enable row level security;
alter table edges enable row level security;
alter table query_logs enable row level security;

-- Helper: check membership (used in policies, avoids N+1)
create or replace function is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

-- Workspaces
create policy "workspaces_select" on workspaces
  for select using (is_workspace_member(id));
create policy "workspaces_insert" on workspaces
  for insert with check (owner_id = auth.uid());
create policy "workspaces_update" on workspaces
  for update using (owner_id = auth.uid());
create policy "workspaces_delete" on workspaces
  for delete using (owner_id = auth.uid());

-- Workspace members
create policy "members_select" on workspace_members
  for select using (is_workspace_member(workspace_id));
create policy "members_insert" on workspace_members
  for insert with check (
    exists (select 1 from workspaces where id = workspace_id and owner_id = auth.uid())
    or user_id = auth.uid()  -- allow self-insert during onboarding
  );
create policy "members_delete" on workspace_members
  for delete using (
    exists (select 1 from workspaces where id = workspace_id and owner_id = auth.uid())
  );

-- Pages
create policy "pages_select" on pages
  for select using (is_workspace_member(workspace_id));
create policy "pages_insert" on pages
  for insert with check (is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "pages_update" on pages
  for update using (is_workspace_member(workspace_id));
create policy "pages_delete" on pages
  for delete using (is_workspace_member(workspace_id));

-- Blocks
create policy "blocks_select" on blocks
  for select using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "blocks_insert" on blocks
  for insert with check (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "blocks_update" on blocks
  for update using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "blocks_delete" on blocks
  for delete using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );

-- Files
create policy "files_select" on files
  for select using (is_workspace_member(workspace_id));
create policy "files_insert" on files
  for insert with check (is_workspace_member(workspace_id));
create policy "files_delete" on files
  for delete using (is_workspace_member(workspace_id));

-- Databases
create policy "databases_select" on databases
  for select using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "databases_insert" on databases
  for insert with check (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );
create policy "databases_update" on databases
  for update using (
    exists (select 1 from pages where id = page_id and is_workspace_member(workspace_id))
  );

-- Database rows
create policy "db_rows_select" on database_rows
  for select using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "db_rows_insert" on database_rows
  for insert with check (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "db_rows_update" on database_rows
  for update using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );
create policy "db_rows_delete" on database_rows
  for delete using (
    exists (
      select 1 from databases d
      join pages p on p.id = d.page_id
      where d.id = database_id and is_workspace_member(p.workspace_id)
    )
  );

-- Nodes
create policy "nodes_select" on nodes
  for select using (is_workspace_member(workspace_id));
create policy "nodes_insert" on nodes
  for insert with check (is_workspace_member(workspace_id));
create policy "nodes_update" on nodes
  for update using (is_workspace_member(workspace_id));
create policy "nodes_delete" on nodes
  for delete using (is_workspace_member(workspace_id));

-- Edges
create policy "edges_select" on edges
  for select using (is_workspace_member(workspace_id));
create policy "edges_insert" on edges
  for insert with check (is_workspace_member(workspace_id));
create policy "edges_delete" on edges
  for delete using (is_workspace_member(workspace_id));

-- Query logs: user sees only their own logs
create policy "query_logs_select" on query_logs
  for select using (user_id = auth.uid() and is_workspace_member(workspace_id));
create policy "query_logs_insert" on query_logs
  for insert with check (user_id = auth.uid() and is_workspace_member(workspace_id));
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```

Expected: No errors. In Supabase Studio (`http://localhost:54323`), navigate to Authentication → Policies — all 10 tables should show policies.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260729000002_rls_policies.sql
git commit -m "feat: add RLS policies for all tables"
```

---

### Task 4: TypeScript Database Types

**Files:**
- Create: `src/lib/types/database.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/lib/types/database.test.ts`:
```ts
import { describe, it, expectTypeOf } from 'vitest'
import type {
  Workspace,
  WorkspaceMember,
  Page,
  Block,
  FileRecord,
  Database,
  DatabaseRow,
  Node,
  Edge,
  QueryLog,
  WorkspaceRole,
  EntityType,
  RelationshipType,
  BlockType,
  DatabaseField,
  QueryLogSource,
} from '@/lib/types/database'

describe('database types', () => {
  it('Workspace has correct shape', () => {
    expectTypeOf<Workspace>().toHaveProperty('id').toBeString()
    expectTypeOf<Workspace>().toHaveProperty('name').toBeString()
    expectTypeOf<Workspace>().toHaveProperty('owner_id').toBeString()
    expectTypeOf<Workspace>().toHaveProperty('created_at').toBeString()
  })

  it('Page has nullable parent_id', () => {
    expectTypeOf<Page['parent_id']>().toEqualTypeOf<string | null>()
  })

  it('WorkspaceRole is a union of valid roles', () => {
    expectTypeOf<WorkspaceRole>().toEqualTypeOf<'owner' | 'editor' | 'viewer'>()
  })

  it('EntityType is a union of valid types', () => {
    expectTypeOf<EntityType>().toEqualTypeOf<'page' | 'block' | 'file' | 'database_row'>()
  })

  it('RelationshipType is a union of valid types', () => {
    expectTypeOf<RelationshipType>().toEqualTypeOf<'mention' | 'backlink' | 'parent_child' | 'manual'>()
  })

  it('Node has nullable embedding', () => {
    expectTypeOf<Node['embedding']>().toEqualTypeOf<number[] | null>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/lib/types/database.test.ts
```

Expected: FAIL — module `@/lib/types/database` not found.

- [ ] **Step 3: Implement types**

Create `src/lib/types/database.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/__tests__/lib/types/database.test.ts
```

Expected: PASS — all type assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/database.ts src/__tests__/lib/types/database.test.ts
git commit -m "feat: add TypeScript database types"
```

---

### Task 5: Supabase Client Utilities + Middleware

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/middleware.ts`
- Create: `src/__tests__/middleware.test.ts`

- [ ] **Step 1: Write failing middleware test**

Create `src/__tests__/middleware.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

async function getMiddleware() {
  const mod = await import('@/middleware')
  return mod.middleware
}

function makeSupabaseMock(user: object | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    cookies: { getAll: vi.fn().mockReturnValue([]), setAll: vi.fn() },
  }
}

describe('middleware', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('redirects unauthenticated user from app route to /login', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/workspace/abc')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('redirects authenticated user from /login to /', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(
      makeSupabaseMock({ id: 'user-1', email: 'a@b.com' }) as any
    )

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/login')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('allows authenticated user through to app route', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(
      makeSupabaseMock({ id: 'user-1' }) as any
    )

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/workspace/abc')
    const response = await middleware(request)

    expect(response.status).toBe(200)
  })

  it('allows unauthenticated user to access /signup', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock(null) as any)

    const middleware = await getMiddleware()
    const request = new NextRequest('http://localhost:3000/signup')
    const response = await middleware(request)

    expect(response.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/middleware.test.ts
```

Expected: FAIL — `@/middleware` not found.

- [ ] **Step 3: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create server Supabase client**

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 5: Create middleware**

Create `src/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/auth')

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- src/__tests__/middleware.test.ts
```

Expected: PASS — all 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts src/__tests__/middleware.test.ts
git commit -m "feat: add Supabase client utilities and auth middleware"
```

---

### Task 6: Auth Pages — Login

**Files:**
- Create: `src/components/auth/LoginForm.tsx`
- Create: `src/__tests__/components/auth/LoginForm.test.tsx`
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Write failing LoginForm test**

Create `src/__tests__/components/auth/LoginForm.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from '@/components/auth/LoginForm'

const mockSignInWithPassword = vi.fn()
const mockSignInWithOtp = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOtp: mockSignInWithOtp,
    },
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and password fields', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('calls signInWithPassword with email and password on submit', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'password123',
      })
    })
  })

  it('shows error message on failed login', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid credentials' } })
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('sends magic link when magic link button clicked with valid email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@test.com' })
      )
      expect(screen.getByText(/magic link sent/i)).toBeInTheDocument()
    })
  })

  it('shows error if magic link clicked without email', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /magic link/i }))

    await waitFor(() => {
      expect(screen.getByText(/enter your email/i)).toBeInTheDocument()
    })
    expect(mockSignInWithOtp).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/components/auth/LoginForm.test.tsx
```

Expected: FAIL — `@/components/auth/LoginForm` not found.

- [ ] **Step 3: Implement LoginForm**

Create `src/components/auth/LoginForm.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const supabase = createClient()

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email first')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setMagicLinkSent(true)
    setLoading(false)
  }

  if (magicLinkSent) {
    return (
      <p className="text-sm text-muted-foreground">
        Magic link sent to {email}. Check your inbox.
      </p>
    )
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={handleMagicLink}
        disabled={loading}
      >
        Send magic link
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/__tests__/components/auth/LoginForm.test.tsx
```

Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Create login page**

Create `src/app/(auth)/login/page.tsx`:
```tsx
import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string; error?: string }
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">graphbrain</h1>
          <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
        </div>
        {searchParams.message && (
          <p className="text-sm text-center text-muted-foreground">{searchParams.message}</p>
        )}
        {searchParams.error && (
          <p className="text-sm text-center text-destructive">{searchParams.error}</p>
        )}
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/LoginForm.tsx src/__tests__/components/auth/LoginForm.test.tsx src/app/\(auth\)/login/
git commit -m "feat: add login form and page with password + magic link support"
```

---

### Task 7: Auth Pages — Signup

**Files:**
- Create: `src/components/auth/SignupForm.tsx`
- Create: `src/__tests__/components/auth/SignupForm.test.tsx`
- Create: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Write failing SignupForm test**

Create `src/__tests__/components/auth/SignupForm.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SignupForm } from '@/components/auth/SignupForm'

const mockSignUp = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signUp: mockSignUp },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and password fields', () => {
    render(<SignupForm />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('calls signUp with email and password on submit', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    render(<SignupForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@test.com', password: 'password123' })
      )
    })
  })

  it('redirects to /login with confirmation message on success', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    render(<SignupForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/login')
      )
    })
  })

  it('shows error message on failed signup', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'Email already registered' } })
    render(<SignupForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/components/auth/SignupForm.test.tsx
```

Expected: FAIL — `@/components/auth/SignupForm` not found.

- [ ] **Step 3: Implement SignupForm**

Create `src/components/auth/SignupForm.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/login?message=Check your email to confirm your account')
    }
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/__tests__/components/auth/SignupForm.test.tsx
```

Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Create signup page**

Create `src/app/(auth)/signup/page.tsx`:
```tsx
import Link from 'next/link'
import { SignupForm } from '@/components/auth/SignupForm'

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">graphbrain</h1>
          <p className="text-sm text-muted-foreground">Create your account</p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/SignupForm.tsx src/__tests__/components/auth/SignupForm.test.tsx src/app/\(auth\)/signup/
git commit -m "feat: add signup form and page"
```

---

### Task 8: Auth Callback + Auto Workspace Creation

**Files:**
- Create: `src/app/(auth)/auth/callback/route.ts`
- Create: `src/__tests__/app/auth/callback.test.ts`

- [ ] **Step 1: Write failing callback test**

Create `src/__tests__/app/auth/callback.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExchangeCodeForSession = vi.fn()
const mockFrom = vi.fn()
const mockRedirect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
    from: mockFrom,
  })),
}))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: vi.fn((url: URL) => ({ status: 307, headers: { location: url.toString() } })),
  },
}))

describe('auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('redirects to / on successful code exchange', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null,
    })

    const selectMock = { eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ workspace_id: 'ws-1' }] }) }
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue(selectMock) })

    const { GET } = await import('@/app/(auth)/auth/callback/route')
    const { NextResponse } = await import('next/server')

    await GET(new Request('http://localhost:3000/auth/callback?code=abc123'))

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(NextResponse.redirect).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/' }))
  })

  it('creates workspace for new user with no existing membership', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-new', email: 'new@test.com' } },
      error: null,
    })

    const insertWorkspaceMock = { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'ws-new' } }) }
    const insertMemberMock = { mockResolvedValue: vi.fn() }
    const noMemberships = { eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [] }) }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn().mockReturnValue(noMemberships),
          insert: vi.fn().mockReturnValue({ then: vi.fn() }),
        }
      }
      if (table === 'workspaces') {
        return { insert: vi.fn().mockReturnValue(insertWorkspaceMock) }
      }
      return {}
    })

    const { GET } = await import('@/app/(auth)/auth/callback/route')
    await GET(new Request('http://localhost:3000/auth/callback?code=newuser'))

    expect(mockFrom).toHaveBeenCalledWith('workspace_members')
    expect(mockFrom).toHaveBeenCalledWith('workspaces')
  })

  it('redirects to /login on missing code', async () => {
    const { GET } = await import('@/app/(auth)/auth/callback/route')
    const { NextResponse } = await import('next/server')

    await GET(new Request('http://localhost:3000/auth/callback'))

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/login' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/app/auth/callback.test.ts
```

Expected: FAIL — route not found.

- [ ] **Step 3: Implement auth callback route**

Create `src/app/(auth)/auth/callback/route.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !user) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  // Auto-create personal workspace for first-time users
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)

  if (!memberships || memberships.length === 0) {
    const workspaceName = user.email
      ? `${user.email.split('@')[0]}'s Workspace`
      : 'My Workspace'

    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ name: workspaceName, owner_id: user.id })
      .select()
      .single()

    if (workspace) {
      await supabase
        .from('workspace_members')
        .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })
    }
  }

  return NextResponse.redirect(new URL(next, origin))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/__tests__/app/auth/callback.test.ts
```

Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/auth/ src/__tests__/app/auth/
git commit -m "feat: add auth callback route with auto workspace creation"
```

---

### Task 9: App Layout, AppShell, and Sidebar

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/workspace/[workspaceId]/page.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/__tests__/components/layout/Sidebar.test.tsx`

- [ ] **Step 1: Write failing Sidebar test**

Create `src/__tests__/components/layout/Sidebar.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar'

vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ workspaceId: 'ws-1' }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockUser = { id: 'user-1', email: 'test@test.com' } as any

const mockWorkspaces = [
  { workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'My Workspace' } },
  { workspace_id: 'ws-2', role: 'editor', workspaces: { id: 'ws-2', name: 'Team Workspace' } },
]

describe('Sidebar', () => {
  it('renders workspace names', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} />)
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(screen.getByText('Team Workspace')).toBeInTheDocument()
  })

  it('highlights the active workspace', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} />)
    const activeLink = screen.getByText('My Workspace').closest('a')
    expect(activeLink?.className).toContain('bg-accent')
  })

  it('renders user email at bottom', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} />)
    expect(screen.getByText('test@test.com')).toBeInTheDocument()
  })

  it('renders graphbrain brand name', () => {
    render(<Sidebar workspaces={mockWorkspaces} user={mockUser} />)
    expect(screen.getByText('graphbrain')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/components/layout/Sidebar.test.tsx
```

Expected: FAIL — `@/components/layout/Sidebar` not found.

- [ ] **Step 3: Implement Sidebar**

Create `src/components/layout/Sidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

interface WorkspaceEntry {
  workspace_id: string
  role: string
  workspaces: { id: string; name: string } | null
}

interface SidebarProps {
  workspaces: WorkspaceEntry[]
  user: User
}

export function Sidebar({ workspaces, user }: SidebarProps) {
  const params = useParams()
  const currentWorkspaceId = params?.workspaceId as string | undefined

  return (
    <aside className="w-64 flex-shrink-0 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-4 border-b">
        <span className="font-semibold text-sm tracking-tight">graphbrain</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {workspaces.map(({ workspaces: ws }) =>
          ws ? (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                currentWorkspaceId === ws.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              {ws.name}
            </Link>
          ) : null
        )}
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/__tests__/components/layout/Sidebar.test.tsx
```

Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Implement AppShell**

Create `src/components/layout/AppShell.tsx`:
```tsx
'use client'

import type { User } from '@supabase/supabase-js'
import { Sidebar } from './Sidebar'

interface WorkspaceEntry {
  workspace_id: string
  role: string
  workspaces: { id: string; name: string } | null
}

interface AppShellProps {
  workspaces: WorkspaceEntry[]
  user: User
  children: React.ReactNode
}

export function AppShell({ workspaces, user, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaces={workspaces} user={user} />
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  )
}
```

- [ ] **Step 6: Create root layout**

Create `src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'graphbrain',
  description: 'Your knowledge graph workspace',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Create root redirect page**

Create `src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (membership) redirect(`/workspace/${membership.workspace_id}`)

  redirect('/login')
}
```

- [ ] **Step 8: Create authenticated app layout**

Create `src/app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id)

  return (
    <AppShell workspaces={workspaces ?? []} user={user}>
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 9: Create workspace landing page**

Create `src/app/(app)/workspace/[workspaceId]/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function WorkspacePage({
  params,
}: {
  params: { workspaceId: string }
}) {
  const supabase = await createClient()

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', params.workspaceId)
    .single()

  if (!workspace) notFound()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">{workspace.name}</h1>
      <p className="text-muted-foreground mt-2">
        Select a page from the sidebar, or create a new one.
      </p>
    </div>
  )
}
```

- [ ] **Step 10: Run all unit tests**

```bash
npm test
```

Expected: All tests pass with no failures.

- [ ] **Step 11: Commit**

```bash
git add src/app/ src/components/layout/ src/__tests__/components/layout/
git commit -m "feat: add app shell, sidebar, layouts, and workspace landing page"
```

---

### Task 10: Smoke Test — Full Auth Flow

**Files:**
- Create: `e2e/auth.spec.ts`

- [ ] **Step 1: Install Playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 2: Write E2E auth flow test**

Create `e2e/auth.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test.describe('authentication flow', () => {
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'testpassword123'

  test('signup → email confirmation redirect → login → workspace', async ({ page }) => {
    // Signup
    await page.goto('/signup')
    await expect(page.getByText('graphbrain')).toBeVisible()

    await page.getByLabel('Email').fill(testEmail)
    await page.getByLabel('Password').fill(testPassword)
    await page.getByRole('button', { name: /create account/i }).click()

    // Should redirect to login with confirmation message
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText(/check your email/i)).toBeVisible()
  })

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/workspace/some-id')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page has sign in and magic link buttons', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /magic link/i })).toBeVisible()
  })

  test('magic link shows confirmation after entering email', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByRole('button', { name: /magic link/i }).click()
    await expect(page.getByText(/magic link sent/i)).toBeVisible()
  })
})
```

- [ ] **Step 3: Start dev server and run E2E tests**

In one terminal:
```bash
npm run dev
```

In another terminal:
```bash
npm run test:e2e -- e2e/auth.spec.ts
```

Expected: All 4 E2E tests pass. (Note: the signup test only verifies redirect to /login — full email confirmation requires Supabase local email testing via `http://localhost:54324`.)

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "feat: add E2E auth flow smoke tests"
```

---

### Task 11: Final Check

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify dev server runs without errors**

```bash
npm run dev
```

Visit `http://localhost:3000` — should redirect to `/login`. Sign up with a test account. Verify you are redirected to `/login?message=Check your email...`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: phase 1 foundation complete"
```

---

## What's Next

- **Phase 2: Editor & Content** — block-based page editor (Tiptap), page CRUD, nested sidebar tree, databases (Table/Kanban/Calendar views), file uploads to Supabase Storage, PDF text extraction
- **Phase 3: Knowledge Graph & AI** — Ollama integration (nomic-embed-text + llama3.1:8b), BullMQ + Redis embedding queue, edge detection from @mentions and `[[links]]`, node/edge management
- **Phase 4: Query Interface** — Cmd+K modal, semantic search via pgvector, graph traversal via Postgres recursive CTEs, streaming AI Q&A with source citations
