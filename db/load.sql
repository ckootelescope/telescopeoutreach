begin;
-- Per-day scheduled load for the next fortnight, split by engine. A function
-- rather than a view so the app can pass a horizon later without a migration.
create or replace function upcoming_load(p_days int default 14)
returns table (d date, "first" int, restart int)
language sql stable as $$
  select s.due_date,
         count(*) filter (where q.kind = 'first')::int,
         count(*) filter (where q.kind = 'restart')::int
    from step s join sequence q on q.id = s.sequence_id
   where q.status = 'active' and s.status in ('planned','drafted')
     and s.due_date > current_date and s.due_date <= current_date + p_days
   group by s.due_date order by s.due_date;
$$;
commit;
