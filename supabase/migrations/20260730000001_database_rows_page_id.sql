alter table database_rows
  add column page_id uuid references pages(id) on delete set null;

create index database_rows_page_idx on database_rows (page_id);
