-- Phase 2 of OS-ARCHITECTURE.md: close the loops.
--
-- Three things Calvin asked for that the data already supports but nothing
-- surfaces, plus the queue that lets a dashboard button do real work.

-- ===========================================================================
-- 1. The LinkedIn touch queue
--
-- 30 of 123 market contacts have no usable email. Apollo could not verify one,
-- or there was none to find. They are not dropped: mo_nudge writes a draft into
-- Calvin's own inbox with the profile URL as the subject, so it is one click to
-- the profile and one paste into InMail.
--
-- The gap was that nothing recorded the touch. 115 drafts exist and every one
-- is still 'queued', which is indistinguishable from 115 people never contacted.
-- A queue with no done state is a list that quietly stops being read.
alter table market.nudge add column if not exists touched_at timestamptz;
alter table market.nudge add column if not exists channel    text;
alter table market.nudge add column if not exists note       text;

comment on column market.nudge.touched_at is
  'When Calvin actually sent the LinkedIn message. Null means still owed.';
comment on column market.nudge.channel is
  'How it went out: inmail, connection_note, message. Recorded because a connection request and an InMail are not the same touch.';

create or replace view v_linkedin_queue as
  select p.slug          project,
         p.anchor_company,
         ct.id           contact_id,
         ct.full_name,
         ct.company_name,
         ct.title,
         ct.angle,
         ct.linkedin_url,
         ct.method,
         n.draft_id,
         n.touched_at,
         -- Someone we could not email at all is the reason this queue exists.
         -- Someone we did email is a second touch, useful but not urgent.
         case when ct.method = 'salesnav' then 'only_channel' else 'reinforcement' end priority,
         (select max(s.sent_at) from market.step s
           where s.contact_id = ct.id and s.status = 'sent')            last_email_sent
    from market.contact ct
    join market.project p on p.id = ct.project_id
    left join market.nudge n on n.contact_id = ct.id
   where p.status = 'open'
     and ct.status not in ('replied','booked','bounced')
     and n.touched_at is null
     and n.draft_id is not null
   order by (ct.method = 'salesnav') desc, p.slug, ct.full_name;

comment on view v_linkedin_queue is
  'LinkedIn touches still owed. only_channel means we have no email for them at all.';

-- ===========================================================================
-- 2. Sequences dying this week
--
-- "Which companies do I elevate to Chris, and which do I stay on?" Monday needs
-- an answer and today there is nowhere to look. A sequence dying is one on its
-- last step with nobody having written back: the last moment intervening is
-- still cheap.
create or replace view v_dying_this_week as
  select c.name                                          company,
         c.primary_domain                                domain,
         q.id                                            sequence_id,
         q.kind,
         q.round,
         max(s.due_date) filter (where s.status = 'planned') last_step_on,
         count(*)        filter (where s.status = 'planned') steps_left,
         max(s.step_no)  filter (where s.status = 'sent')     furthest_sent,
         (select max(e.sent_at) from email_event e
           where e.company_id = c.id and e.direction = 'out') last_contact
    from sequence q
    join company c on c.id = q.company_id
    join step    s on s.sequence_id = q.id
   where q.status = 'active'
     -- Never written back. A replier is a live conversation, not a dying one.
     and not exists (select 1 from email_event e
                      where e.company_id = c.id and e.direction = 'in')
   group by c.id, c.name, c.primary_domain, q.id, q.kind, q.round
  having count(*) filter (where s.status = 'planned') > 0
     and max(s.due_date) filter (where s.status = 'planned') <= pt_today() + 7
   order by last_step_on, company;

comment on view v_dying_this_week is
  'Active sequences whose final step lands within 7 days and who have never replied. The last cheap moment to intervene.';

-- ===========================================================================
-- 3. Replied, but no meeting
--
-- Calvin asked for "companies that responded but pushed me off for a call".
-- sequence.outcome already has the right shape and two rows use it, because
-- nothing populates it. Until reply intent is classified properly, absence of a
-- meeting is the honest proxy: they wrote back and no call came of it.
create or replace view v_replied_no_meeting as
  select c.name                             company,
         c.primary_domain                   domain,
         q.id                               sequence_id,
         q.round,
         q.outcome,
         q.outcome_note,
         min(e.sent_at)                     first_reply,
         max(e.sent_at)                     last_reply,
         count(*)                           replies,
         extract(day from now() - max(e.sent_at))::int days_since_reply,
         -- Every reply that never became a call is 220 rows and nobody reviews
         -- 220 rows weekly. Bucketed so the page can default to this_week and
         -- let the rest be asked for.
         case when max(e.sent_at) > now() - interval '14 days' then 'this_week'
              when max(e.sent_at) > now() - interval '45 days' then 'this_quarter'
              else 'older' end               bucket
    from sequence q
    join company c on c.id = q.company_id
    join email_event e on e.company_id = c.id and e.direction = 'in'
   where q.status in ('replied','completed','active')
     and coalesce(q.outcome, '') <> 'meeting'
     -- Our own address never counts as them replying.
     and e.sender_email not ilike '%@telescopepartners.com'
   group by c.id, c.name, c.primary_domain, q.id, q.round, q.outcome, q.outcome_note
   order by max(e.sent_at) desc;

comment on view v_replied_no_meeting is
  'They wrote back and it did not become a call. outcome=not_now once classified; until then absence of a meeting is the proxy.';

-- ===========================================================================
-- 4. action_queue
--
-- The web app holds Supabase and the Anthropic API. It does not hold the
-- mailbox, and spreading send capability into the browser tier to give a button
-- something to do would be the wrong trade. So a button writes an intent and
-- the robot performs it on the next tick, which keeps exactly one process able
-- to touch Gmail.
create table if not exists action_queue (
  id           bigserial primary key,
  kind         text        not null,
  payload      jsonb       not null,
  requested_by text        not null default 'calvin',
  requested_at timestamptz not null default now(),
  status       text        not null default 'queued',   -- queued|done|failed|cancelled
  attempts     int         not null default 0,
  started_at   timestamptz,
  finished_at  timestamptz,
  result       jsonb,
  error        text
);

create index if not exists action_queue_pending_idx
  on action_queue (requested_at) where status = 'queued';

comment on table action_queue is
  'Dashboard intents the robot executes. Anything touching the mailbox queues here rather than running in the web tier.';
comment on column action_queue.kind is
  'draft_investor_email | log_touch | mark_linkedin_touched | draft_linkedin';

create or replace view v_action_queue as
  select id, kind, status, requested_at, attempts,
         payload->>'subject_name' subject_name,
         coalesce(error, result->>'summary') outcome
    from action_queue
   order by case status when 'queued' then 0 when 'failed' then 1 else 2 end,
            requested_at desc;
