-- Weekly OS, revision 11: the command center feed.
--
-- The Dashboard tab is now three things, in this order: today's call prep, the
-- Break-In queue, and the HTC escalations. Each is produced by a claude.ai
-- scheduled task (Daily Call Prep 6:41am, Daily Break-In List 6:52am weekdays,
-- HTC Escalation 8:52am Tue/Thu) that does the MCP research and writes one row
-- here. The console only renders.
--
-- One row per (kind, for_date). A re-run the same day replaces the payload.
-- What Calvin does with an item (touched, posted, skipped) lives in
-- os_feed_action, keyed by item_key, so a re-run never wipes his check marks.
--
-- Apply:  node scripts/apply_sql.js db/os11.sql   (safe to re-run)

create table if not exists os_daily_feed (
  id           bigserial primary key,
  kind         text not null check (kind in ('call_prep', 'break_in', 'htc')),
  for_date     date not null,
  items        jsonb not null default '[]'::jsonb,
  summary      jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  unique (kind, for_date)
);

create table if not exists os_feed_action (
  kind      text not null,
  for_date  date not null,
  item_key  text not null,
  status    text not null check (status in ('done', 'skipped')),
  acted_at  timestamptz not null default now(),
  primary key (kind, for_date, item_key)
);

alter table os_daily_feed  enable row level security;
alter table os_feed_action enable row level security;
revoke all on os_daily_feed, os_feed_action from anon, authenticated;
revoke all on sequence os_daily_feed_id_seq from anon, authenticated;

-- The most recent row of each kind. HTC only runs Tue/Thu, so "latest" rather
-- than "today" is what the page wants; it shows the date it is as of.
create or replace view v_os_feed_latest as
select distinct on (kind) *
  from os_daily_feed
 order by kind, for_date desc, generated_at desc;

revoke all on v_os_feed_latest from anon, authenticated;
