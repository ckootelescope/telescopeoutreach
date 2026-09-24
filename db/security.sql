-- Lock the public schema away from the Supabase HTTP API's anonymous roles.
--
-- Nothing in this project is meant to be reachable with the anon/publishable key.
-- The console (web/lib/supabase.ts) uses service_role, which bypasses RLS, and the
-- scripts connect as postgres via SUPABASE_DB_URL. Before this, anyone holding the
-- project URL and the anon key could read and write every table and view.
--
-- RLS with no policies denies anon/authenticated on tables. The revokes also cover
-- the reporting views, which run as their owner and would otherwise bypass RLS.
-- Safe to re-run.

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;
grant  execute on all functions in schema public to service_role;

-- Tables, views and functions created later start locked too.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;
