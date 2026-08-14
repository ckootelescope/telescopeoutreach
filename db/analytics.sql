-- Analytics layer for the outreach console.
-- Everything the Next.js app reads goes through a view, so query logic lives in
-- the database and the app stays a rendering layer.

begin;

-- ----------------------------------------------------------------- outcomes
-- A reply is not a result. "Not raising right now" and "let's talk next week"
-- score identically until someone says which one happened.
alter table sequence add column if not exists outcome text
  check (outcome in ('meeting','interested','not_now','pass','wrong_person','no_reply'));
alter table sequence add column if not exists outcome_note text;
alter table sequence add column if not exists outcome_at timestamptz;

-- --------------------------------------------------------- reply attribution
-- One row per sequence with the founder's first genuine reply. A reply only
-- counts from the founder's own domain: teammate cc's and vendor mail would
-- otherwise inflate every rate downstream.
create or replace view an_sequence_reply as
  select q.id sequence_id, q.company_id, q.contact_id, q.kind, q.status, q.outcome,
         co.name company, co.primary_domain domain, ct.name founder, ct.email,
         split_part(ct.email, '@', 2) founder_domain,
         (select min(s.sent_at) from step s
           where s.sequence_id = q.id and s.status = 'sent') first_sent,
         (select count(*) from step s
           where s.sequence_id = q.id and s.status = 'sent') steps_sent,
         (select min(e.sent_at) from email_event e
           where e.company_id = q.company_id and e.direction = 'in'
             and split_part(e.sender_email, '@', 2) = split_part(ct.email, '@', 2)) replied_at
    from sequence q
    join company co on co.id = q.company_id
    join contact ct on ct.id = q.contact_id
   where q.status in ('active','replied','completed','bounced');

-- ------------------------------------------------------ marginal reply rate
-- The honest per-step number. Denominator is founders still silent when that
-- email went out, so it is not distorted by the fact that replying early is
-- exactly why fewer emails get sent.
create or replace view an_step_performance as
  with sent as (
    select q.id sequence_id, q.kind, q.company_id, split_part(ct.email,'@',2) dom,
           s.step_no, s.sent_at
      from sequence q
      join contact ct on ct.id = q.contact_id
      join step s on s.sequence_id = q.id and s.status = 'sent' and s.sent_at is not null
  ), replied as (
    select t.sequence_id, min(e.sent_at) reply_at
      from sent t
      join email_event e on e.company_id = t.company_id and e.direction = 'in'
       and split_part(e.sender_email,'@',2) = t.dom
     group by 1
  ), win as (
    select t.*, r.reply_at,
           lead(t.sent_at) over (partition by t.sequence_id order by t.step_no) next_sent
      from sent t left join replied r on r.sequence_id = t.sequence_id
  )
  select kind, step_no,
         count(*) filter (where reply_at is null or reply_at >= sent_at) at_risk,
         count(*) filter (where reply_at >= sent_at
                            and (next_sent is null or reply_at < next_sent)) replied_here,
         round(100.0 * count(*) filter (where reply_at >= sent_at
                            and (next_sent is null or reply_at < next_sent))
             / nullif(count(*) filter (where reply_at is null or reply_at >= sent_at), 0), 1) pct
    from win group by kind, step_no;

-- --------------------------------------------------------- time to first reply
create or replace view an_reply_latency as
  select case
           when replied_at - first_sent < interval '6 hours'  then '0-6h'
           when replied_at - first_sent < interval '24 hours' then '6-24h'
           when replied_at - first_sent < interval '3 days'   then '1-3d'
           when replied_at - first_sent < interval '8 days'   then '3-8d'
           else '8d+' end bucket,
         case
           when replied_at - first_sent < interval '6 hours'  then 1
           when replied_at - first_sent < interval '24 hours' then 2
           when replied_at - first_sent < interval '3 days'   then 3
           when replied_at - first_sent < interval '8 days'   then 4
           else 5 end ord,
         count(*) n
    from an_sequence_reply
   where replied_at is not null and first_sent is not null
   group by 1,2;

-- ------------------------------------------------------------ send-hour effect
-- Reply rate by the hour Calvin actually sends, Pacific. He sends most nights
-- between 11pm and midnight; this says whether that costs him anything.
create or replace view an_send_hour as
  select extract(hour from (first_sent at time zone 'America/Los_Angeles'))::int hour_pt,
         count(*) sent,
         count(replied_at) replied,
         round(100.0 * count(replied_at) / nullif(count(*),0), 1) pct
    from an_sequence_reply
   where first_sent is not null
   group by 1;

-- ------------------------------------------------------------- net new by week
-- Calvin's definition: a company is net new the week HIS first email to it went
-- out. Restarts are not net new, so only round 1 counts.
create or replace view an_net_new_weekly as
  select date_trunc('week', first_sent)::date week,
         count(*) net_new,
         count(replied_at) replied,
         round(100.0 * count(replied_at) / nullif(count(*),0), 1) pct
    from an_sequence_reply
   where kind = 'first' and first_sent is not null
   group by 1;

-- ------------------------------------------------------------- outcome funnel
create or replace view an_outcome_funnel as
  select coalesce(outcome, case when replied_at is not null then 'untagged' else 'no_reply' end) outcome,
         count(*) n
    from an_sequence_reply
   group by 1;

-- ------------------------------------------------------------- trust / drift
-- Whether the database still agrees with the mailbox. Every other number on the
-- dashboard is only as good as this one.
create or replace view an_trust as
  select
    (select count(*) from step s join sequence q on q.id = s.sequence_id
      where s.status = 'sent' and s.sent_at is null) sent_without_timestamp,
    (select count(*) from step s join sequence q on q.id = s.sequence_id
      where q.status = 'active' and s.status = 'drafted') drafted_never_sent,
    (select count(*) from step s join sequence q on q.id = s.sequence_id
      where q.status = 'active' and s.status = 'planned' and s.due_date < current_date) overdue,
    (select count(*) from sequence q where q.status = 'active'
       and (select count(*) from step s where s.sequence_id = q.id) <> 4) incomplete_cadence,
    (select count(*) from (
       select q.id from sequence q join step s on s.sequence_id = q.id
        where q.status = 'active' and s.status in ('planned','drafted')
        group by q.id
       having max(s.due_date) filter (where s.step_no = 4)
            <= max(s.due_date) filter (where s.step_no = 3)) z) spacing_violations,
    (select max(sent_at) from email_event where source = 'gmail') last_observed_mail;

commit;
