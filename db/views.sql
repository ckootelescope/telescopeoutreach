-- Dashboard views. Each one answers a question Calvin actually asked this week.

begin;

-- what needs drafting today.
-- Careful with the aliases here: s is step, q is sequence. This view used to
-- expose s.id under the name "sequence_id", which is the step id wearing the
-- wrong label, so joining it back to sequence.id silently matched nothing.
-- Both ids are now published under their real names.
drop view if exists v_due;
create view v_due as
select s.id step_id, q.id sequence_id, c.name company, ct.name founder, ct.email,
       q.round, q.kind, s.step_no, s.due_date, s.status
  from step s
  join sequence q on q.id = s.sequence_id
  join company  c on c.id = q.company_id
  join contact ct on ct.id = q.contact_id
 where s.status = 'planned'
   and q.status = 'active'
   and s.due_date <= pt_today()
 order by s.due_date, c.name;

-- which cadences wrap up when
create or replace view v_finishing as
select c.name company, q.round, q.kind,
       max(s.due_date) filter (where s.status = 'planned') as finishes_on,
       count(*) filter (where s.status = 'planned')        as steps_left
  from sequence q
  join company c on c.id = q.company_id
  join step    s on s.sequence_id = q.id
 where q.status = 'active'
 group by c.name, q.round, q.kind
having count(*) filter (where s.status = 'planned') > 0
 order by 4;

-- net new vs restart, by week, counted off what actually SENT
create or replace view v_weekly as
select date_trunc('week', pt(s.sent_at))::date as week_of,
       count(*) filter (where q.kind = 'first')   as net_new,
       count(*) filter (where q.kind = 'restart') as restarts
  from step s
  join sequence q on q.id = s.sequence_id
 where s.step_no = 1 and s.sent_at is not null
 group by 1
 order by 1 desc;

-- replied and not yet answered
create or replace view v_awaiting_reply as
select c.name company, ct.name founder, ct.email,
       max(e.sent_at) filter (where e.direction = 'in')  as last_inbound,
       max(e.sent_at) filter (where e.direction = 'out') as last_outbound
  from email_event e
  join company  c on c.id = e.company_id
  join contact ct on ct.id = e.contact_id
 group by c.name, ct.name, ct.email
having max(e.sent_at) filter (where e.direction = 'in') is not null
   and coalesce(max(e.sent_at) filter (where e.direction = 'out'), '-infinity')
     < max(e.sent_at) filter (where e.direction = 'in')
 order by 4 desc;

-- the panel that matters: everything the old system could not see
create or replace view v_broken_state as
  -- opener sent, no cadence attached
  select 'sent_no_cadence' as issue, c.name as company, s.due_date as ref_date,
         'opener sent ' || pt(s.sent_at)::date || ', sequence still ' || q.status as detail
    from sequence q
    join company c on c.id = q.company_id
    join step    s on s.sequence_id = q.id and s.step_no = 1
   where q.status = 'needs_scheduling' and s.sent_at is not null
union all
  -- fewer than four steps
  select 'incomplete_cadence', c.name, min(s.due_date),
         'only ' || count(*) || ' of 4 steps exist'
    from sequence q
    join company c on c.id = q.company_id
    join step    s on s.sequence_id = q.id
   where q.status in ('active','completed')
   group by c.name, q.id
  having count(*) < 4
union all
  -- drafted but never actually sent, and the next step already passed
  select 'drafted_not_sent', c.name, s.due_date,
         'step ' || s.step_no || ' drafted ' || pt(s.drafted_at)::date || ', never sent'
    from step s
    join sequence q on q.id = s.sequence_id
    join company  c on c.id = q.company_id
   where s.drafted_at is not null
     and s.sent_at is null
     and s.due_date < pt_today() - 2
union all
  -- company we emailed that has no company record cadence at all
  select 'no_prior_check', c.name, null::date,
         'no prior-contact check recorded before first send'
    from company c
    join sequence q on q.company_id = c.id and q.round = 1
   where not exists (select 1 from prior_check p where p.company_id = c.id);

commit;
