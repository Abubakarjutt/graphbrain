# Phase 2b: Databases Design

**Date:** 2026-07-30  
**Status:** Approved

---

## Overview

Phase 2b adds Notion-style databases to graphbrain. A database is a container of pages — each row is a full page with a block editor and a structured properties panel. Three views are delivered across three sequential sub-phases:

- **2b-i:** Table view (foundation)
- **2b-ii:** Kanban view
- **2b-iii:** Calendar view

---

## Architecture

### Data Model

The existing schema already has `databases` (linked to a container page via `page_id`) and `database_rows` (with `fields jsonb`). One migration is needed:

**Add `page_id UUID FK → pages` to `database_rows`:**
- Each row owns a full page (title + block editor)
- Creating a row atomically creates a `database_rows` record + a child `pages` record (`parent_id = databases.page_id`)
- `ON DELETE SET NULL` on `database_rows.page_id`: if the linked page is deleted directly, the row loses its page reference but survives; the server action `deleteRow` handles the normal path (deletes both atomically)
- RLS on `database_rows` enforces workspace isolation via join to `databases → pages → workspace_id`

**Existing schema (unchanged):**
```sql
databases(id uuid PK, page_id uuid FK→pages ON DELETE CASCADE, schema jsonb)
database_rows(id uuid PK, database_id uuid FK→databases ON DELETE CASCADE, fields jsonb)
```

**Migration adds:**
```sql
ALTER TABLE database_rows ADD COLUMN page_id uuid REFERENCES pages(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL` on `database_rows.page_id` means if the linked page is deleted directly, the row loses its page reference but is not deleted (prevents orphaned rows). The server action `deleteRow` deletes both atomically.

### Routing

| URL | What renders |
|-----|-------------|
| `/workspace/[workspaceId]/database/[databaseId]` | Database page (table/kanban/calendar) |
| `/workspace/[workspaceId]/page/[pageId]` | Row page (existing PageEditor + PropertiesPanel) |

The database container page (stored in `pages`) is navigated via its database route, not the page route.

### Sidebar

A "Databases" section appears below "Pages" in the sidebar with a "+ Database" button. Clicking it calls `createDatabase` which creates a `pages` record (type marker via title "Untitled Database") and a `databases` record linked to it. Database rows appear as child pages under the database in the sidebar.

---

## Sub-Phase 2b-i: Table View

### Components

**Server components:**
- `src/app/(app)/workspace/[workspaceId]/database/[databaseId]/page.tsx` — fetches database schema + rows, renders `DatabaseShell`
- `src/app/(app)/workspace/[workspaceId]/page/[pageId]/page.tsx` — existing, extended to render `PropertiesPanel` when page is a database row

**Client components:**
- `src/components/database/DatabaseShell.tsx` — header (title + view switcher) + renders active view
- `src/components/database/TableView.tsx` — schema columns as headers, rows as editable inline cells, "+ New Row" button
- `src/components/database/SchemaEditor.tsx` — add/rename/delete fields; field types: `text | number | date | select | multi_select | checkbox | url`
- `src/components/database/PropertiesPanel.tsx` — shown on row page; renders each schema field as an editable input
- `src/components/layout/SidebarDatabaseTree.tsx` — databases section in sidebar

**Server actions (`src/lib/actions/databases.ts`):**
- `createDatabase(workspaceId)` → creates `pages` + `databases` records, returns database
- `getDatabase(databaseId, workspaceId)` → returns schema + rows with their linked page titles
- `updateDatabaseSchema(databaseId, workspaceId, schema)` → updates `databases.schema`
- `createRow(databaseId, workspaceId)` → atomically creates `database_rows` + child `pages` record
- `updateRowFields(rowId, databaseId, workspaceId, fields)` → updates `database_rows.fields`
- `deleteRow(rowId, databaseId, workspaceId)` → deletes row + its linked page

### Data Flow

1. User clicks "+ Database" → `createDatabase` → redirects to `/workspace/[workspaceId]/database/[databaseId]`
2. Database page fetches schema + rows server-side, renders `TableView`
3. User adds a field → `SchemaEditor` calls `updateDatabaseSchema`
4. User clicks "+ New Row" → `createRow` → new row appears in table + new child page created
5. User clicks row title → navigates to `/workspace/[workspaceId]/page/[pageId]` → `PageEditor` + `PropertiesPanel`
6. User edits a cell inline in table → `updateRowFields`

---

## Sub-Phase 2b-ii: Kanban View

### Additional Components

- `src/components/database/KanbanView.tsx` — groups rows by a `select` field chosen via a "Group by" dropdown; each select option = one column; rows are cards
- `src/components/database/KanbanCard.tsx` — row card with title, drag handle, click-to-open
- View switcher in `DatabaseShell` header: `Table | Kanban | Calendar` tabs

### Drag-and-Drop

Uses `@dnd-kit/core`. Dragging a card between columns calls `updateRowFields` with the new select option value. Optimistic UI: move card immediately, revert on error.

### Constraints

- Kanban requires at least one `select` field in the schema; shows "Add a Select field to use Kanban view" empty state otherwise
- Uncategorized rows (field value = null) appear in an "No Status" column

---

## Sub-Phase 2b-iii: Calendar View

### Additional Components

- `src/components/database/CalendarView.tsx` — month grid; rows placed by a chosen `date` field; uses `react-big-calendar`
- "Group by date" dropdown (same pattern as Kanban's "Group by" selector) to pick which date field drives placement
- Clicking a day slot calls `createRow` with that date pre-filled in the selected date field

### Constraints

- Calendar requires at least one `date` field; shows empty state otherwise
- Rows with null date field value are not shown in calendar view (shown in a "Undated" list below the calendar)

---

## Error Handling

- All server actions throw on DB error; client components catch and show inline `text-destructive` messages (same pattern as `PageEditor`)
- `createRow` is atomic: if `pages` insert succeeds but `database_rows` insert fails, the orphaned page is deleted before throwing
- RLS on `database_rows` enforces workspace isolation via `databases.page_id → pages.workspace_id`

---

## Testing

**Unit tests (Vitest, same mock pattern as `pages.test.ts`):**
- `src/__tests__/lib/actions/databases.test.ts` — `createDatabase`, `createRow` (atomicity), `updateRowFields`, `deleteRow`, `getDatabase`

**Component tests:**
- `TableView` renders schema columns and rows with mock data
- `KanbanView` groups rows by select field, renders columns
- `CalendarView` places rows on correct date slots

**E2E (Playwright):**
- Create database → add schema fields → add row → open row page → edit properties → switch Table→Kanban→Calendar views
- Kanban: drag card between columns, verify field updated
- Calendar: click day slot, verify row created with date pre-filled
