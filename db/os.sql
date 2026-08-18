-- Weekly Operating System
--
-- The outreach tables (company, sequence, step) record what was SENT. These
-- record what Calvin intends to DO. They are deliberately separate: a task can
-- point at a company that has no cadence, at a market that is not a company at
-- all, or at nothing.
--
-- Prefixed os_ so it is obvious at a glance which half of the database a table
-- belongs to, and so `task` and `week` cannot be confused with `step` and the
-- v_weekly reporting views.
--
-- Apply:  node scripts/apply_sql.js db/os.sql

-- ---------------------------------------------------------------------------
-- Markets. A deep dive is a container, the same way a company is. Reading,
-- Harmonic sourcing against the theme, expert calls and market outreach all
-- hang off one of these, which is what stops the third search for insurance
-- experts starting from nothing.
-- ---------------------------------------------------------------------------
create table if not exists os_market (
  id          bigserial primary key,
  name        text not null unique,
  status      text not null default 'open'
                check (status in ('open', 'paused', 'closed')),
  thesis      text,
  notes       text,
  opened_on   date not null default (now() at time zone 'America/Los_Angeles')::date,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- A week. `intent` holds the Sunday paragraph verbatim, so the plan can always
-- be read back against what was actually asked for.
-- ---------------------------------------------------------------------------
create table if not exists os_week (
  id          bigserial primary key,
  week_of     date not null unique,          -- the Monday, Pacific
  status      text not null default 'planning'
                check (status in ('planning', 'active', 'closed')),
  intent      text,
  review      text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Priority order, declared by Calvin. Nothing infers this. Rank 1 is the top.
-- A row can point at a company, a market, or a whole stream, because "sourcing
-- sits above everything except Pathwork" is a real statement about a stream.
-- ---------------------------------------------------------------------------
create table if not exists os_priority (
  id          bigserial primary key,
  rank        int not null,
  label       text not null,
  kind        text not null check (kind in ('company', 'market', 'stream')),
  company_id  bigint references company(id) on delete set null,
  market_id   bigint references os_market(id) on delete set null,
  stream      text,
  note        text,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create unique index if not exists os_priority_rank_uq
  on os_priority (rank) where active;

-- ---------------------------------------------------------------------------
-- Calendar events, read only. Cached here rather than fetched per request so
-- the page renders without a Google round trip, and so "what did the week
-- actually look like" survives after the fact.
-- ---------------------------------------------------------------------------
create table if not exists os_calendar_event (
  id           bigserial primary key,
  external_id  text not null unique,
  summary      text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  day          date not null,                -- Pacific
  all_day      boolean not null default false,
  location     text,
  attendees    text[],
  synced_at    timestamptz not null default now()
);

create index if not exists os_calendar_event_day on os_calendar_event (day);

-- ---------------------------------------------------------------------------
-- The task. The durable unit.
--
-- week_id / day / due_on are all nullable and all mutable. A task is not owned
-- by a week, which is what makes carry-over free: at Friday close an unfinished
-- task drops its day and keeps its subject.
--
-- subject_label always carries the display name. company_id and market_id link
-- to a record when one exists, but a task about a company with no cadence is
-- still a first-class task.
-- ---------------------------------------------------------------------------
create table if not exists os_task (
  id            bigserial primary key,
  title         text not null,
  notes         text,

  stream        text not null
                  check (stream in ('diligence', 'sourcing', 'investor', 'market', 'learning')),
  subject_kind  text not null default 'none'
                  check (subject_kind in ('company', 'market', 'person', 'none')),
  subject_label text,
  company_id    bigint references company(id) on delete set null,
  market_id     bigint references os_market(id) on delete set null,

  week_id       bigint references os_week(id) on delete set null,
  day           date,                        -- null = a weekly item with no day yet
  due_on        date,                         -- may sit beyond this week
  calendar_ref  text,                         -- the event this is anchored to

  -- Only three things may create a task: Calvin said it, it was fanned out from
  -- something Calvin said, or Calvin asked for a suggestion. Nothing else.
  origin        text not null default 'calvin'
                  check (origin in ('calvin', 'expanded', 'asked_for')),
  ref_kind      text,
  ref_id        bigint,

  status        text not null default 'open'
                  check (status in ('open', 'done', 'moved', 'dropped')),
  sort          int not null default 0,
  gtask_id      text,                         -- Google Tasks id once pushed
  gtask_synced_at timestamptz,

  created_at    timestamptz not null default now(),
  done_at       timestamptz
);

create index if not exists os_task_week on os_task (week_id);
create index if not exists os_task_day on os_task (day) where status = 'open';
create index if not exists os_task_backlog on os_task (subject_label)
  where week_id is null and status = 'open';
create index if not exists os_task_gtask on os_task (gtask_id) where gtask_id is not null;

-- done_at and status cannot disagree.
create or replace function os_task_stamp() returns trigger as $$
begin
  if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$ language plpgsql;

drop trigger if exists os_task_stamp_t on os_task;
create trigger os_task_stamp_t before insert or update on os_task
  for each row execute function os_task_stamp();

-- ---------------------------------------------------------------------------
-- The conversation. actions_taken records what the model actually wrote, so a
-- plan can be traced back to the turn that produced it.
-- ---------------------------------------------------------------------------
create table if not exists os_message (
  id            bigserial primary key,
  week_id       bigint references os_week(id) on delete cascade,
  role          text not null check (role in ('calvin', 'system')),
  content       text not null,
  actions_taken jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists os_message_week on os_message (week_id, created_at);

-- ---------------------------------------------------------------------------
-- Reading views
-- ---------------------------------------------------------------------------

-- Tasks with their subject resolved.
create or replace view v_os_task as
select t.id, t.title, t.notes, t.stream, t.subject_kind,
       coalesce(t.subject_label, c.name, m.name) as subject,
       t.company_id, t.market_id, t.week_id, t.day, t.due_on,
       t.calendar_ref, t.origin, t.ref_kind, t.ref_id,
       t.status, t.sort, t.gtask_id, t.created_at, t.done_at,
       w.week_of
  from os_task t
  left join company c on c.id = t.company_id
  left join os_market m on m.id = t.market_id
  left join os_week w on w.id = t.week_id;

-- The current week, Pacific. Monday-based.
create or replace view v_os_this_week as
select * from os_week
 where week_of = (date_trunc('week', (now() at time zone 'America/Los_Angeles'))::date)
 limit 1;

-- Everything open with no week attached. This is the carry-over pool and the
-- per-company backlog at the same time.
create or replace view v_os_backlog as
select * from v_os_task
 where week_id is null and status = 'open'
 order by coalesce(subject, ''), created_at;

-- Priority order with names resolved.
create or replace view v_os_priority as
select p.id, p.rank, p.label, p.kind, p.stream, p.note,
       coalesce(p.label, c.name, m.name) as display,
       p.company_id, p.market_id
  from os_priority p
  left join company c on c.id = p.company_id
  left join os_market m on m.id = p.market_id
 where p.active
 order by p.rank;
