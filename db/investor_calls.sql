-- Applied 2026-10-07 as Supabase migration "os_investor_call".
-- One row per conversation with an investor (Granola call, coffee, dinner).
-- os_investor_target stays the person record; this is the history behind it.
create table if not exists os_investor_call (
  id          bigserial primary key,
  target_id   bigint not null references os_investor_target(id) on delete cascade,
  day         date not null,
  kind        text not null default 'call',          -- call | coffee | dinner | event
  source      text not null default 'granola',
  granola_id  text unique,                             -- Granola meeting UUID, null for non-Granola touches
  url         text,                                    -- link to the full note
  title       text,
  notes       text,                                    -- condensed takeaways: firm, focus, deals traded
  next_steps  text,
  created_at  timestamptz not null default now()
);
create index if not exists os_investor_call_target_day on os_investor_call (target_id, day desc);
alter table os_investor_call enable row level security;

-- Per-investor rollup: who, how many conversations, first and last.
create or replace view v_os_investor_history with (security_invoker = on) as
select t.id, t.name, t.firm, t.title, t.email, t.bucket, t.relationship, t.tier, t.status,
       count(c.id)::int                         as calls,
       min(c.day)                               as first_call,
       max(c.day)                               as last_call,
       greatest(t.last_outreach, max(c.day))    as last_spoken,
       (current_date - greatest(t.last_outreach, max(c.day)))::int as days_since,
       t.note,
       (array_agg(c.notes order by c.day desc))[1] as latest_notes,
       (array_agg(c.url   order by c.day desc))[1] as latest_url
  from os_investor_target t
  left join os_investor_call c on c.target_id = t.id
 where t.status <> 'skip'
 group by t.id;
