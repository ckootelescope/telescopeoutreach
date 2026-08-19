-- Weekly OS, revision 7: the Hard to Crack list.
--
-- Membership and status come from the Affinity saved view (list 333624, view
-- 2354626), which is the system of record. The shape mirrors the sheet tab
-- Calvin already reads: company, website, status, owner, one-liner, next step.
--
-- The point of the list is companies Telescope has not broken into yet, so the
-- most useful column is not status but how long since anyone last emailed them.
--
-- Apply:  node scripts/apply_sql.js db/os7.sql

create table if not exists os_hard_to_crack (
  id            bigserial primary key,
  company       text not null unique,
  domain        text,
  one_liner     text,
  tp_status     text,            -- Affinity TPStatus: Discovery, Pipeline: SQL
  list_status   text,            -- Affinity list Status: Chase
  tp_owner      text,
  score         int,
  last_email_at date,
  last_email_subject text,
  last_email_to text,
  next_step     text,
  note          text,
  active        boolean not null default true,
  synced_at     timestamptz not null default now()
);

create index if not exists os_htc_owner on os_hard_to_crack (tp_owner) where active;

-- Joined to the outreach database so a company that already has a live cadence
-- is obvious. company_domain is the bridge; a name match alone is unreliable.
create or replace view v_os_hard_to_crack as
select h.*,
       (current_date - h.last_email_at) as days_since_email,
       co.id as company_id,
       s.status  as sequence_status,
       s.round   as sequence_round,
       (select max(e.sent_at)::date from email_event e
         where e.company_id = co.id and e.direction = 'in') as last_reply_at
  from os_hard_to_crack h
  left join company_domain cd on cd.domain = h.domain
  left join company co on co.id = cd.company_id
  left join lateral (
    select sq.status, sq.round from sequence sq
     where sq.company_id = co.id order by sq.id desc limit 1
  ) s on true
 where h.active;
