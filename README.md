# graphbrain

**Your knowledge graph workspace.** A second brain that thinks in connections — capture, link, and query your knowledge, backed by a real knowledge graph and a local AI assistant that never sends your data anywhere.

Pages, databases, and files aren't just stored side by side — every page, block, file, and database row becomes a node in a graph, linked by mentions, backlinks, and relationships. Ask a question and graphbrain retrieves the relevant nodes and answers using a locally-running LLM, with citations back to your own content.

## Features

- **Pages & blocks** — a fast, keyboard-driven rich text editor (slash commands, callouts, toggles, task lists) built on Tiptap
- **Databases** — structured collections with four views: Table, Kanban, Calendar, and Time tracking, with a configurable schema editor
- **Knowledge graph** — pages, blocks, files, and database rows are automatically linked into a graph via mentions, backlinks, and parent/child relationships
- **Local AI Q&A** — semantic search and retrieval-augmented answers over your own workspace, powered by [Ollama](https://ollama.com) running entirely on your machine — no data leaves your device
- **File import** — drop in PDFs, Word documents, and text/Markdown files; content is extracted and woven into the graph automatically
- **Workspaces & collaboration** — multi-user workspaces with role-based access (owner/editor/viewer), email invites, and row-level security enforced at the database
- **Command palette** — instant Cmd+K search across pages, databases, and files
- **Desktop app** — a native macOS app (Electron) wrapping the same product, no browser required

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript |
| Database | [Supabase](https://supabase.com) (Postgres, Auth, Storage, Row-Level Security) |
| Vector search | [pgvector](https://github.com/pgvector/pgvector) for embedding-based retrieval |
| Local AI | [Ollama](https://ollama.com) for embeddings and chat completion |
| Editor | [Tiptap](https://tiptap.dev) |
| Styling | Tailwind CSS |
| Desktop | Electron + electron-builder |
| Testing | Vitest (unit/integration), Playwright (end-to-end) |

## Getting started

### Prerequisites

- Node.js 20 or later
- A [Supabase](https://supabase.com) project (free tier is sufficient)
- [Ollama](https://ollama.com) installed locally, with the `nomic-embed-text` embedding model pulled — required for the knowledge graph and Ask features:

  ```bash
  ollama pull nomic-embed-text
  ```

### Setup

1. **Clone and install dependencies**

   ```bash
   git clone https://github.com/Abubakarjutt/graphbrain.git
   cd graphbrain
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env.local` and fill in your Supabase project's URL and publishable (anon) key:

   ```bash
   cp .env.example .env.local
   ```

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
   ```

   Optionally, set `OLLAMA_URL` if Ollama isn't running on the default `http://localhost:11434`.

3. **Apply the database schema**

   Push the migrations in `supabase/migrations/` to your Supabase project using the [Supabase CLI](https://supabase.com/docs/guides/cli):

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --db-url <your-postgres-connection-string>
   ```

4. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Desktop app

graphbrain also ships as a native macOS app.

```bash
npm run electron:dev     # run the desktop shell against your local dev server
npm run build:desktop    # produce a distributable .dmg in release/
```

The desktop build bakes in the Supabase backend configured in `.env.local` at build time — end users never configure a backend or touch a terminal.

## Testing

```bash
npm test          # unit & integration tests (Vitest)
npm run test:e2e  # end-to-end tests (Playwright)
npm run lint       # ESLint
```

## Project structure

```
src/
  app/               Next.js routes (App Router)
  components/
    editor/          Block editor, slash menu, callouts, toggles
    database/         Table, Kanban, Calendar, and Time views
    query/            Command palette and Ask UI
    files/            File upload and preview
    layout/           Shell, sidebar, navigation
  lib/
    actions/          Server actions (workspaces, pages, databases, files, todos)
    graph/            Knowledge graph construction, embeddings, retrieval
    parsing/          PDF/DOCX/text-to-Markdown conversion
    supabase/          Supabase client setup
supabase/migrations/  Database schema, RLS policies, and RPCs
electron/              Desktop app entry point and packaging config
```

## License

This project is currently private and unlicensed for external use.
