-- Diligence market outreach. See market-outreach/SPEC.md
--
-- Deliberately its own schema, not a table prefix in public. Company outreach
-- and market outreach share one database and one Gmail client and nothing else;
-- putting these in `market` means a query has to explicitly reach into the
-- schema to see any of it, so `sequence` can never be accidentally joined to a
-- market contact. There are no foreign keys between the two worlds, and market
-- mail is NEVER written to public.email_event, which would corrupt the
-- dash_*/an_* reply numbers.

create schema if not exists market;

-- ------------------------------------------------------------------- project

-- One per diligence target. anchor_company is internal context only: it selects
-- the industry and workflow language and MUST NOT appear in any email.
create table if not exists market.project (
  id               bigint generated always as identity primary key,
  anchor_company   text not null,
  slug             text not null unique,
  industry         text not null,
  workflow         text not null,
  fu3_insight_html text,
  status           text not null default 'open' check (status in ('open','closed')),
  created_at       timestamptz not null default now(),
  closed_at        timestamptz
);

-- --------------------------------------------------------------- copy blocks

-- The project x angle grid. Angle is not cosmetic: for a competitor, paragraph
-- 2's "tools that help brands like [Company]" is actively wrong, because the
-- competitor IS the tool. Each block is authored once, approved, then frozen
-- for every contact on that project at that angle so responses stay comparable.
create table if not exists market.copy_block (
  id                bigint generated always as identity primary key,
  project_id        bigint not null references market.project(id) on delete cascade,
  angle             text not null check (angle in ('customer','competitor','former','advisor','other')),
  para1_s2          text not null,
  para2_html        text not null,
  uses_company_slot boolean not null default true,
  frozen_on         date,
  created_at        timestamptz not null default now(),
  unique (project_id, angle)
);

-- ------------------------------------------------------------------- contact

-- NOT globally unique on email on purpose: the same expert may legitimately be
-- contacted again for a later deal. Prior contact is surfaced on the batch CSV,
-- not blocked.
create table if not exists market.contact (
  id             bigint generated always as identity primary key,
  project_id     bigint not null references market.project(id) on delete cascade,
  full_name      text not null,
  first_name     text not null,
  title          text,
  company_name   text,
  company_domain text,
  linkedin_url   text not null,
  angle          text not null check (angle in ('customer','competitor','former','advisor','other')),
  email          text,
  email_status   text,
  gate_reason    text,
  method         text not null default 'salesnav' check (method in ('email','salesnav')),
  status         text not null default 'queued'
                 check (status in ('queued','manual','active','replied','booked','bounced','stopped','completed')),
  apollo_id      text,
  created_at     timestamptz not null default now(),
  ended_on       date
);

create unique index if not exists mo_contact_email_uq
  on market.contact (project_id, lower(email)) where email is not null;

-- ---------------------------------------------------------------------- step

create table if not exists market.step (
  id          bigint generated always as identity primary key,
  contact_id  bigint not null references market.contact(id) on delete cascade,
  step_no     smallint not null check (step_no between 1 and 4),
  due_date    date not null,
  send_after  timestamptz,
  subject     text,
  body_html   text,
  status      text not null default 'planned'
              check (status in ('planned','sent','cancelled','skipped','failed')),
  sent_at     timestamptz,
  thread_id   text,
  message_id  text,
  fail_reason text,
  unique (contact_id, step_no)
);

create index if not exists mo_step_due on market.step (due_date) where status = 'planned';
create index if not exists mo_step_contact on market.step (contact_id);

-- --------------------------------------------------------------------- event

-- Append-only. message_id unique makes the sweep idempotent.
create table if not exists market.event (
  id           bigint generated always as identity primary key,
  contact_id   bigint references market.contact(id) on delete cascade,
  project_id   bigint references market.project(id) on delete cascade,
  direction    text not null check (direction in ('out','in')),
  kind         text not null default 'outbound'
               check (kind in ('outbound','reply','bounce','ooo','bulk')),
  sender_email text,
  peer_email   text,
  thread_id    text,
  message_id   text not null unique,
  subject      text,
  sent_at      timestamptz not null,
  observed_at  timestamptz not null default now()
);

create index if not exists mo_event_contact on market.event (contact_id, direction, sent_at);

-- --------------------------------------------------------------------- nudge

-- The LinkedIn draft sent to Calvin himself: subject is the profile URL, body is
-- the email that went out. Recorded for visibility only, never verified.
create table if not exists market.nudge (
  id         bigint generated always as identity primary key,
  contact_id bigint not null references market.contact(id) on delete cascade unique,
  draft_id   text,
  status     text not null default 'queued' check (status in ('queued','done','failed')),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- guards

-- A contact leaving 'active' must cancel every step that has not gone out.
-- Doing this in a trigger rather than in each script is deliberate: the company
-- system cancelled only 'planned' steps and left already-drafted ones live, one
-- keystroke from mailing a founder who had already replied. Here there is one
-- place to get it right.
create or replace function market.stop_steps_on_exit() returns trigger as $$
begin
  if new.status in ('replied','booked','bounced','stopped')
     and old.status is distinct from new.status then
    update market.step
       set status = 'cancelled'
     where contact_id = new.id
       and status in ('planned','failed');
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_mo_stop_steps on market.contact;
create trigger trg_mo_stop_steps
  after update of status on market.contact
  for each row execute function market.stop_steps_on_exit();

-- Never send to someone who is not live. Belt and braces against a script bug.
create or replace function market.block_send_when_not_live() returns trigger as $$
declare s text;
begin
  if new.status = 'sent' and old.status is distinct from 'sent' then
    select status into s from market.contact where id = new.contact_id;
    if s not in ('active','queued') then
      raise exception 'contact % is %, refusing to mark step % as sent',
        new.contact_id, s, new.id;
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_mo_block_send on market.step;
create trigger trg_mo_block_send
  before update of status on market.step
  for each row execute function market.block_send_when_not_live();

-- --------------------------------------------------------------------- views

-- What mo_send should pick up. Mirrors v_due's role for company outreach but
-- lives in the market schema so the two can never be confused.
create or replace view market.v_due as
  select st.id step_id, st.contact_id, st.step_no, st.due_date, st.send_after,
         ct.project_id, ct.full_name, ct.first_name, ct.email, ct.angle,
         ct.company_name, p.slug project_slug, p.anchor_company
    from market.step st
    join market.contact ct on ct.id = st.contact_id
    join market.project p  on p.id  = ct.project_id
   where st.status = 'planned'
     and ct.status in ('active','queued')
     and ct.method = 'email'
     and st.due_date <= pt_today();

-- Per-project funnel.
create or replace view market.v_project_status as
  select p.slug, p.anchor_company, p.status,
         count(*) filter (where ct.method = 'email')            emailed,
         count(*) filter (where ct.method = 'salesnav')         salesnav,
         count(*) filter (where ct.status = 'active')           active,
         count(*) filter (where ct.status = 'replied')          replied,
         count(*) filter (where ct.status = 'booked')           booked,
         count(*) filter (where ct.status = 'bounced')          bounced,
         count(*) filter (where ct.status = 'completed')        completed
    from market.project p
    left join market.contact ct on ct.project_id = p.id
   group by p.id, p.slug, p.anchor_company, p.status;
