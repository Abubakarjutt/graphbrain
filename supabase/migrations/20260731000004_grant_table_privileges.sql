-- Base table privileges for the API roles.
--
-- RLS policies (migration 20260729000002) filter *rows*, but they only run
-- after Postgres checks table-level privileges. Without these GRANTs the
-- `authenticated` role is denied every query with `42501 permission denied`
-- before any policy is evaluated — which manifested as login appearing to
-- fail (sign-in succeeded, then the root page could not read/create a
-- workspace and bounced the user back to /login).

grant usage on schema public to anon, authenticated;

-- Row visibility is still governed by RLS; these grants only unlock the tables.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Apply the same defaults to any tables/sequences created by later migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
