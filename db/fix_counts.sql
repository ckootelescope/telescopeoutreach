begin;

drop view if exists v_broken_state;
drop view if exists dash_summary;
drop view if exists dash_drafted_not_sent;

create view dash_drafted_not_sent as
select c.name as company, ct.email, q.kind, s.step_no,
       s.due_date, s.drafted_at::date as drafted_on,
       current_date - s.due_date as days_since_due
  from step s
  join sequence q on q.id = s.sequence_id
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
 where s.drafted_at is not null and s.sent_at is null
   and s.status not in ('skipped','cancelled')
   and s.due_date < current_date - 2
 order by s.due_date desc;

create view dash_summary as
select
  (select count(*) from company)                            as companies,
  (select count(*) from sequence where status = 'active')   as active_sequences,
  (select count(*) from sequence where status = 'replied')  as replied_sequences,
  (select count(*) from step where status = 'planned' and due_date <= current_date) as due_now,
  (select count(*) from dash_work_queue)                    as work_queue,
  (select count(*) from dash_drafted_not_sent)              as drafted_never_sent,
  (select count(*) from dash_incomplete_cadence)            as incomplete_active_cadences,
  (select count(*) from dash_ended_early)                   as restart_candidates;

create view v_broken_state as
  select 'sent_no_cadence' as issue, company, opener_sent as ref_date,
         'opener sent, no cadence attached' as detail from dash_work_queue
union all
  select 'incomplete_cadence', company, last_sent,
         steps_missing || ' of 4 steps missing on an ACTIVE sequence' from dash_incomplete_cadence
union all
  select 'drafted_not_sent', company, due_date,
         'step ' || step_no || ' drafted, never sent' from dash_drafted_not_sent;

commit;
