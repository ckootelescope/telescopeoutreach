-- Weekly OS, revision 2.
--
-- Four changes, all driven by how Calvin actually plans:
--
--   1. Every task has a day AND a time block. A task with no day defeats the
--      point, which is knowing which evenings to keep clear. start_min/end_min
--      are minutes from Pacific midnight, so 20:00-22:30 is 1200-1350 and a
--      block may run to 1440.
--
--   2. Meeting briefs live in their own table, keyed on the calendar event.
--      os_sync.js upserts events on every run, so anything hand written on the
--      event row would be destroyed by the next sync.
--
--   3. Investor context is per FIRM, not per meeting. "Frontline invested in
--      Avallon and Vcola, bring it up" is true of the firm and should survive
--      into the next call rather than being retyped.
--
--   4. The three big things for a day are their own table. They are the top of
--      the dashboard and nothing else competes with them.
--
-- Apply:  node scripts/apply_sql.js db/os2.sql

-- ---------------------------------------------------------------------------
-- 1. Tasks get real time blocks, and a day is mandatory.
-- ---------------------------------------------------------------------------
alter table os_task add column if not exists start_min int;
alter table os_task add column if not exists end_min int;

-- Backfill anything undated before the constraint lands. A future anchor keeps
-- its own date; everything else falls on its week's Monday.
update os_task set day = due_on where day is null and due_on is not null;
update os_task t set day = w.week_of
  from os_week w where t.week_id = w.id and t.day is null;

alter table os_task alter column day set not null;

do $$ begin
  alter table os_task add constraint os_task_start_range
    check (start_min is null or (start_min >= 0 and start_min <= 1440));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table os_task add constraint os_task_end_range
    check (end_min is null or (end_min > 0 and end_min <= 1440));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table os_task add constraint os_task_block_order
    check (start_min is null or end_min is null or end_min > start_min);
exception when duplicate_object then null; end $$;

create index if not exists os_task_slot on os_task (day, start_min);

-- Nothing is undated now, so the no-day backlog view is gone.
drop view if exists v_os_backlog;

-- ---------------------------------------------------------------------------
-- 2. Investors, tracked per firm.
-- ---------------------------------------------------------------------------
create table if not exists os_investor (
  id         bigserial primary key,
  firm       text not null unique,
  domain     text,
  invests_in text,                      -- what they actually write cheques for
  track      text[],                    -- deals to raise on the next call
  notes      text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Meeting briefs. One row per calendar event, hand written, sync safe.
--
-- category drives which block of the dashboard the card appears in:
--   company  -> a company call, needs a one-liner and a focus
--   investor -> links to os_investor for the firm level context
--   internal -> Telescope, so the brief is just what to bring
--   other    -> operators, experts, everything else
-- ---------------------------------------------------------------------------
create table if not exists os_meeting_brief (
  external_id text primary key
                references os_calendar_event(external_id) on delete cascade,
  category    text not null default 'other'
                check (category in ('company', 'investor', 'internal', 'other')),
  org         text,                     -- company or firm name as Calvin says it
  counterpart text,                     -- who is on the call
  title       text,
  one_liner   text,                      -- what the company does
  focus       text,                      -- what to focus on, or what to prepare
  company_id  bigint references company(id) on delete set null,
  investor_id bigint references os_investor(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. The three big things. Rank 1 to 3, one set per day.
-- ---------------------------------------------------------------------------
create table if not exists os_big_three (
  id         bigserial primary key,
  day        date not null,
  rank       int not null check (rank between 1 and 3),
  title      text not null,
  note       text,
  status     text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  unique (day, rank)
);

-- ---------------------------------------------------------------------------
-- Reading views
-- ---------------------------------------------------------------------------

-- Tasks with their subject resolved and the time block rendered.
-- Dropped rather than replaced: the new time columns land mid-list, and
-- create or replace cannot reorder or insert view columns.
drop view if exists v_os_today;
drop view if exists v_os_task;
create view v_os_task as
select t.id, t.title, t.notes, t.stream, t.subject_kind,
       coalesce(t.subject_label, c.name, m.name) as subject,
       t.company_id, t.market_id, t.week_id, t.day, t.due_on,
       t.start_min, t.end_min,
       to_char((t.day + make_interval(mins => t.start_min))::timestamp, 'HH12:MIam') as start_label,
       to_char((t.day + make_interval(mins => t.end_min))::timestamp, 'HH12:MIam')   as end_label,
       -- Anything starting at or after 18:00 is evening deep work. Calvin plans
       -- sourcing into the day and reading into the night, so the split is worth
       -- being able to filter on rather than recomputing in the page.
       (t.start_min >= 1080) as is_evening,
       t.calendar_ref, t.origin, t.ref_kind, t.ref_id,
       t.status, t.sort, t.gtask_id, t.created_at, t.done_at,
       w.week_of
  from os_task t
  left join company c on c.id = t.company_id
  left join os_market m on m.id = t.market_id
  left join os_week w on w.id = t.week_id;

-- Every meeting in the week with its brief and firm context attached.
create or replace view v_os_meeting as
select e.external_id, e.summary, e.starts_at, e.ends_at, e.day, e.location,
       e.attendees,
       to_char(e.starts_at at time zone 'America/Los_Angeles', 'HH12:MIam') as time_label,
       coalesce(b.category, 'other') as category,
       b.org, b.counterpart, b.title, b.one_liner, b.focus,
       i.firm, i.invests_in, i.track,
       (b.external_id is null) as needs_brief
  from os_calendar_event e
  left join os_meeting_brief b on b.external_id = e.external_id
  left join os_investor i on i.id = b.investor_id
 order by e.starts_at;

-- What today looks like, tasks only, in time order.
create or replace view v_os_today as
select * from v_os_task
 where day = (now() at time zone 'America/Los_Angeles')::date
 order by coalesce(start_min, 9999), sort;
