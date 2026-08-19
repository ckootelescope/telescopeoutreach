-- Weekly OS, revision 9: catch sends that never became cadences.
--
-- An opener only counts once a sequence exists. Sending happens in Superhuman;
-- the sequence is created afterwards by new_cadence.js. When that second step is
-- skipped the send is invisible to the tracker forever, and nothing self-heals:
-- mark_sent.js reconciles steps that already exist, so with no steps there is
-- nothing for it to find.
--
-- Cosine, PostSig and Evos all sat in that state for a week and only surfaced
-- because Calvin noticed the weekly net-new number looked low.
--
-- Apply:  node scripts/apply_sql.js db/os9.sql

create table if not exists os_orphan_send (
  id           bigserial primary key,
  thread_id    text not null unique,
  message_id   text,
  peer_email   text not null,
  peer_domain  text not null,
  subject      text,
  sent_at      timestamptz not null,
  resolution   text not null default 'open'
                 check (resolution in ('open', 'cadence_opened', 'ignored')),
  note         text,
  first_seen   timestamptz not null default now()
);

create index if not exists os_orphan_open on os_orphan_send (sent_at desc)
  where resolution = 'open';

-- Still orphaned right now. A row stops appearing the moment a sequence exists
-- for that domain, so resolving one needs no bookkeeping.
create or replace view v_os_orphan as
select o.*,
       (current_date - o.sent_at::date) as days_ago,
       co.name as matched_company
  from os_orphan_send o
  left join company_domain cd on cd.domain = o.peer_domain
  left join company co on co.id = cd.company_id
 where o.resolution = 'open'
   and not exists (
     select 1 from sequence q
      join company_domain cd2 on cd2.company_id = q.company_id
     where cd2.domain = o.peer_domain)
 order by o.sent_at desc;
