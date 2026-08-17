-- Dashboard views for Supabase Studio.
-- Every view is named dash_* so they sort together in the Table Editor.
-- Each one answers a question Calvin actually asked while running the old system.

begin;

-- ============================================================ 1. KPI strip
-- one row, the numbers worth glancing at
create or replace view dash_summary as
select
  (select count(*) from company)                                              as companies,
  (select count(*) from sequence where status = 'active')                     as active_sequences,
  (select count(*) from sequence where status = 'replied')                    as replied_sequences,
  (select count(*) from step where status = 'planned' and due_date <= pt_today()) as due_now,
  (select count(*) from sequence where status = 'needs_scheduling')           as needs_scheduling,
  (select count(*) from step s join sequence q on q.id = s.sequence_id
     where s.drafted_at is not null and s.sent_at is null
       and s.due_date < pt_today() - 2)                                     as drafted_never_sent,
  (select count(*) from (
      select q.id from sequence q join step s on s.sequence_id = q.id
       where q.status in ('active','completed') group by q.id having count(*) < 4) z) as incomplete_cadences;

-- ============================================ 2. what needs drafting today
create or replace view dash_due as
select c.name as company, ct.name as founder, ct.email,
       q.kind, q.round, s.step_no, s.due_date,
       pt_today() - s.due_date as days_overdue
  from step s
  join sequence q on q.id = s.sequence_id
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
 where s.status = 'planned' and q.status = 'active' and s.due_date <= pt_today()
 order by s.due_date, c.name;

-- ===================================== 3. THE WORK QUEUE: opener, no cadence
-- companies emailed once with no follow-ups ever attached
create or replace view dash_work_queue as
select c.name as company, cd.domain, ct.name as founder, ct.email,
       pt(s.sent_at)::date as opener_sent,
       pt_today() - pt(s.sent_at)::date as days_since,
       q.kind, q.round
  from sequence q
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
  join step     s on s.sequence_id = q.id and s.step_no = 1
  left join company_domain cd on cd.company_id = c.id and cd.domain = c.primary_domain
 where q.status = 'needs_scheduling'
   and s.sent_at is not null
   and not exists (select 1 from email_event e
                    where e.company_id = q.company_id and e.direction = 'in')
 order by s.sent_at;

-- ============================== 4. cadences that will terminate early
create or replace view dash_incomplete_cadence as
select c.name as company, ct.email, q.kind, q.round, q.status,
       count(s.id)               as steps_present,
       4 - count(s.id)           as steps_missing,
       max(s.step_no)            as highest_step,
       max(pt(s.sent_at))::date      as last_sent
  from sequence q
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
  join step     s on s.sequence_id = q.id
 where q.status in ('active','completed')
 group by c.name, ct.email, q.kind, q.round, q.status, q.id
having count(s.id) < 4
 order by max(s.sent_at) desc nulls last;

-- ===================================== 5. drafted but never actually sent
-- Gmail-corroborated: a draft exists, no message ever left the mailbox
create or replace view dash_drafted_not_sent as
select c.name as company, ct.email, q.kind, s.step_no,
       s.due_date, pt(s.drafted_at)::date as drafted_on,
       pt_today() - s.due_date as days_since_due
  from step s
  join sequence q on q.id = s.sequence_id
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
 where s.drafted_at is not null and s.sent_at is null
   and s.due_date < pt_today() - 2
 order by s.due_date desc;

-- ======================================== 6. replied, awaiting your response
create or replace view dash_awaiting_reply as
select c.name as company, ct.name as founder, ct.email,
       max(pt(e.sent_at)) filter (where e.direction = 'in')::date  as last_inbound,
       max(pt(e.sent_at)) filter (where e.direction = 'out')::date as last_outbound,
       pt_today() - max(pt(e.sent_at)) filter (where e.direction = 'in')::date as days_waiting
  from email_event e
  join company  c on c.id = e.company_id
  join contact ct on ct.id = e.contact_id
 group by c.name, ct.name, ct.email
having max(e.sent_at) filter (where e.direction = 'in') is not null
   and coalesce(max(e.sent_at) filter (where e.direction = 'out'), '-infinity')
     < max(e.sent_at) filter (where e.direction = 'in')
 order by 4 desc;

-- ================================================= 7. weekly volume
create or replace view dash_weekly as
select date_trunc('week', pt(s.sent_at))::date as week_of,
       count(*) filter (where q.kind = 'first')   as net_new,
       count(*) filter (where q.kind = 'restart') as restarts,
       count(*)                                   as total
  from step s
  join sequence q on q.id = s.sequence_id
 where s.step_no = 1 and s.sent_at is not null
 group by 1 order by 1 desc;

-- ================================================= 8. cadences finishing
create or replace view dash_finishing as
select c.name as company, q.kind, q.round,
       min(s.due_date) filter (where s.status = 'planned') as next_send,
       max(s.due_date) filter (where s.status = 'planned') as finishes_on,
       count(*)        filter (where s.status = 'planned') as steps_left
  from sequence q
  join company c on c.id = q.company_id
  join step    s on s.sequence_id = q.id
 where q.status = 'active'
 group by c.name, q.kind, q.round, q.id
having count(*) filter (where s.status = 'planned') > 0
 order by 5;

-- ====================== 9. companies never checked for prior team contact
-- informational, not a defect: prior_check starts empty
create or replace view dash_no_prior_check as
select c.name as company, c.primary_domain, ct.email,
       min(pt(s.sent_at))::date as first_contacted
  from sequence q
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
  join step     s on s.sequence_id = q.id
 where q.round = 1
   and not exists (select 1 from prior_check p where p.company_id = c.id)
 group by c.name, c.primary_domain, ct.email
 order by 4 desc nulls last;

-- =================== 10. where the DB and the old tracker still disagree
create or replace view dash_source_conflict as
select c.name as company, ct.email, s.step_no, s.due_date,
       'tracker says sent, gmail has no message' as issue
  from step s
  join sequence q on q.id = s.sequence_id
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
 where s.status = 'drafted' and s.sent_at is null
   and exists (select 1 from email_event e
                where e.company_id = q.company_id and e.source = 'tracker'
                  and e.direction = 'out'
                  and pt(e.sent_at)::date between s.due_date - 1 and s.due_date + 6)
 order by s.due_date desc;

-- keep the old broken-state roll-up, minus the noisy prior-check row
create or replace view v_broken_state as
  select 'sent_no_cadence' as issue, company, opener_sent as ref_date,
         'opener sent, no cadence attached' as detail from dash_work_queue
union all
  select 'incomplete_cadence', company, last_sent,
         steps_missing || ' of 4 steps missing' from dash_incomplete_cadence
union all
  select 'drafted_not_sent', company, due_date,
         'step ' || step_no || ' drafted, never sent' from dash_drafted_not_sent;

commit;
