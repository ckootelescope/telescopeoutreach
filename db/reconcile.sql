-- Clean-slate reconciliation.
-- Every statement here is a data correction. Nothing sends or drafts email.

begin;

-- 1. Calvin: none of those companies matter.
drop view if exists dash_source_conflict;

-- 2. Drafts that were created and never sent, on cadences that have since
--    ended or where the founder replied. The cadence moved on; these are not
--    pending work. 'skipped' records that they existed and never went out.
update step s set status = 'skipped'
  from sequence q
 where q.id = s.sequence_id
   and s.drafted_at is not null
   and s.sent_at is null
   and s.due_date < current_date - 2
   and q.status in ('completed','replied','cancelled');

-- 3. needs_scheduling where the founder has actually written back.
--    Never chase these.
update sequence q set status = 'replied',
       ended_on = coalesce(ended_on, (select max(e.sent_at)::date from email_event e
                                       where e.company_id = q.company_id and e.direction = 'in'))
 where q.status = 'needs_scheduling'
   and exists (select 1 from email_event e
                where e.company_id = q.company_id and e.direction = 'in');

-- 4. needs_scheduling where the opener is more than 10 days old and no reply.
--    A Round 1 cadence finishes by day 12, so these are cold, not mid-flight.
--    Closing them makes them restart candidates rather than silent gaps.
update sequence q set status = 'completed',
       ended_on = coalesce(ended_on, (select max(s.sent_at)::date from step s where s.sequence_id = q.id))
  from step s1
 where s1.sequence_id = q.id and s1.step_no = 1
   and q.status = 'needs_scheduling'
   and s1.sent_at is not null
   and s1.sent_at::date < current_date - 10;

-- 5. needs_scheduling where the opener was never actually sent. There is no
--    outreach here at all, so the sequence should not exist.
update sequence q set status = 'cancelled', ended_on = current_date
  from step s1
 where s1.sequence_id = q.id and s1.step_no = 1
   and q.status = 'needs_scheduling'
   and s1.sent_at is null;

commit;

begin;

-- 6. "Incomplete cadence" is only a defect when the sequence is still ACTIVE.
--    All 66 are completed - they are history, not pending breakage. Split the
--    view so the dashboard stops crying wolf.
create or replace view dash_incomplete_cadence as
select c.name as company, ct.email, q.kind, q.round, q.status,
       count(s.id) as steps_present, 4 - count(s.id) as steps_missing,
       max(s.step_no) as highest_step, max(s.sent_at)::date as last_sent
  from sequence q
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
  join step     s on s.sequence_id = q.id
 where q.status = 'active'
 group by c.name, ct.email, q.kind, q.round, q.status, q.id
having count(s.id) < 4
 order by max(s.sent_at) desc nulls last;

-- historical record of cadences that ended early: restart candidates
create or replace view dash_ended_early as
select c.name as company, c.primary_domain, ct.email, q.kind, q.round,
       count(s.id) as steps_sent, max(s.sent_at)::date as last_contact,
       current_date - max(s.sent_at)::date as days_cold
  from sequence q
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
  join step     s on s.sequence_id = q.id
 where q.status = 'completed'
   and not exists (select 1 from email_event e
                    where e.company_id = q.company_id and e.direction = 'in')
 group by c.name, c.primary_domain, ct.email, q.kind, q.round, q.id
having count(s.id) < 4
 order by max(s.sent_at) desc nulls last;

-- 7. THE definitive active-sequence view: what is live and what goes next
create or replace view dash_active as
select c.name as company, ct.name as founder, ct.email,
       q.kind, q.round, q.subject,
       (select min(due_date) from step where sequence_id = q.id and status = 'planned') as next_send,
       (select min(step_no)  from step where sequence_id = q.id and status = 'planned') as next_step,
       (select count(*)      from step where sequence_id = q.id and status = 'planned') as steps_remaining,
       (select max(sent_at)::date from step where sequence_id = q.id)                   as last_sent
  from sequence q
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
 where q.status = 'active'
 order by 7, 1;

-- 8. THE definitive company log: everyone contacted, and what they got
create or replace view dash_company_log as
select c.name as company, c.primary_domain as domain, ct.email,
       q.kind, q.round, q.status as sequence_status,
       count(*) filter (where s.sent_at is not null)  as emails_sent,
       min(s.sent_at)::date                            as first_contact,
       max(s.sent_at)::date                            as last_contact,
       exists (select 1 from email_event e
                where e.company_id = q.company_id and e.direction = 'in') as replied
  from sequence q
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
  left join step s on s.sequence_id = q.id
 group by c.name, c.primary_domain, ct.email, q.kind, q.round, q.status, q.id, q.company_id
 order by max(s.sent_at) desc nulls last;

-- 9. rebuild the roll-up without the retired conflict view
create or replace view v_broken_state as
  select 'sent_no_cadence' as issue, company, opener_sent as ref_date,
         'opener sent, no cadence attached' as detail from dash_work_queue
union all
  select 'incomplete_cadence', company, last_sent,
         steps_missing || ' of 4 steps missing on an ACTIVE sequence' from dash_incomplete_cadence
union all
  select 'drafted_not_sent', company, due_date,
         'step ' || step_no || ' drafted, never sent' from dash_drafted_not_sent;

commit;
