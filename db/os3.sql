-- Weekly OS, revision 3.
--
--   1. Meetings can be checked off. They get rescheduled and cancelled like
--      anything else, so a fixed row Calvin cannot close is a lie. status lives
--      on os_calendar_event and is deliberately NOT in the sync upsert, so
--      os_sync.js can refresh times without resetting what he closed.
--
--   2. An expert category. Eleven of this week's meetings are AlphaSights or
--      Tegus calls attached to a live deal. Lumping them under "other" hides the
--      substance of the Pathwork and Rebar work.
--
--   3. A company-call target per week. Calvin wants 10 conversations a week and
--      wants to see the gap.
--
--   4. os_investor_target: the investor tab. People at peer firms worth knowing,
--      with a role, a LinkedIn URL and a drafted opener. This is a deliverable
--      to act on, not a task to go do research for.
--
-- Apply:  node scripts/apply_sql.js db/os3.sql

-- ---------------------------------------------------------------------------
-- 1 + 2 + 3
-- ---------------------------------------------------------------------------
alter table os_calendar_event add column if not exists status text not null default 'scheduled';

do $$ begin
  alter table os_calendar_event add constraint os_cal_status
    check (status in ('scheduled', 'done', 'moved', 'cancelled'));
exception when duplicate_object then null; end $$;

alter table os_meeting_brief drop constraint if exists os_meeting_brief_category_check;
alter table os_meeting_brief add constraint os_meeting_brief_category_check
  check (category in ('company', 'investor', 'expert', 'internal', 'other'));

-- Which deal an expert call serves. Pathwork, Rebar, Echelon.
alter table os_meeting_brief add column if not exists deal text;

alter table os_week add column if not exists calls_goal int not null default 10;

-- ---------------------------------------------------------------------------
-- 4. The investor tab.
--
-- bucket is the only judgement here, and it is about Telescope's position:
--   coinvest   -> writes cheques at the same stage, so shared Series A dealflow
--   downstream -> Series B and later, so a home for portfolio companies later
--   corporate  -> strategic money and customer introductions
--   upstream   -> pre-seed and seed, so they see companies before Telescope does
-- ---------------------------------------------------------------------------
create table if not exists os_investor_target (
  id           bigserial primary key,
  name         text not null,
  firm         text not null,
  title        text,
  linkedin     text,
  email        text,
  bucket       text not null default 'coinvest'
                 check (bucket in ('coinvest', 'upstream', 'downstream', 'corporate')),
  invests_in   text,
  why          text,                  -- why this person is worth Calvin's time
  message      text,                  -- the opener, ready to send
  source       text,                  -- where the name came from
  tp_poc       text,
  status       text not null default 'todo'
                 check (status in ('todo', 'sent', 'replied', 'met', 'skip')),
  verified     boolean not null default true,   -- false when the record is doubtful
  note         text,
  sort         int not null default 0,
  updated_at   timestamptz not null default now(),
  unique (name, firm)
);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
drop view if exists v_os_call_progress;
drop view if exists v_os_meeting;
create view v_os_meeting as
select e.external_id, e.summary, e.starts_at, e.ends_at, e.day, e.location,
       e.attendees, e.status,
       to_char(e.starts_at at time zone 'America/Los_Angeles', 'HH12:MIam') as time_label,
       coalesce(b.category, 'other') as category,
       b.org, b.counterpart, b.title, b.one_liner, b.focus, b.deal,
       i.firm, i.invests_in, i.track,
       (b.external_id is null) as needs_brief
  from os_calendar_event e
  left join os_meeting_brief b on b.external_id = e.external_id
  left join os_investor i on i.id = b.investor_id;

-- Company-call progress for the active week.
create view v_os_call_progress as
select w.week_of, w.calls_goal,
       count(*) filter (where m.category = 'company') as booked,
       count(*) filter (where m.category = 'company' and m.status = 'done') as held
  from os_week w
  left join v_os_meeting m
         on m.day between w.week_of and (w.week_of + 4)
 group by w.week_of, w.calls_goal;
