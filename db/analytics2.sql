-- Granular email performance analytics.
-- Depends on: analytics.sql (an_sequence_reply, an_step_performance).

begin;

-- ---------------------------------------- reply trigger attribution
-- Which email was the last one sent before the founder replied?
-- Unlike an_step_performance (marginal at-risk rate), this answers
-- "if I hadn't sent Email N, would I have gotten this reply?"
create or replace view an_reply_trigger as
  with last_sent as (
    select s.id seq_id, s.kind,
           max(st.step_no) as trigger_email
      from sequence s
      join step st on st.sequence_id = s.id
     where s.status = 'replied' and st.status = 'sent'
     group by s.id, s.kind
  ),
  sent_counts as (
    select s.kind, st.step_no, count(*) as sent
      from sequence s
      join step st on st.sequence_id = s.id
     where st.status = 'sent'
     group by s.kind, st.step_no
  )
  select sc.kind, sc.step_no, sc.sent,
         coalesce(count(ls.seq_id), 0) as triggered_reply,
         round(100.0 * count(ls.seq_id) / nullif(sc.sent, 0), 1) as trigger_rate
    from sent_counts sc
    left join last_sent ls on ls.kind = sc.kind and ls.trigger_email = sc.step_no
   group by sc.kind, sc.step_no, sc.sent
   order by sc.kind, sc.step_no;

-- ---------------------------------------- cumulative reply capture
-- If you stopped the cadence after Email N, what % of replies would you keep?
create or replace view an_cumulative_capture as
  with last_sent as (
    select s.id, s.kind,
           max(st.step_no) as trigger_email
      from sequence s
      join step st on st.sequence_id = s.id
     where s.status = 'replied' and st.status = 'sent'
     group by s.id, s.kind
  ),
  totals as (
    select kind, count(*) as total_replies from last_sent group by kind
  ),
  per_step as (
    select ls.kind, ls.trigger_email, count(*) as replies_from_this, t.total_replies
      from last_sent ls
      join totals t on t.kind = ls.kind
     group by ls.kind, ls.trigger_email, t.total_replies
  )
  select kind, trigger_email as step_no,
         replies_from_this as marginal,
         total_replies,
         sum(replies_from_this) over (partition by kind order by trigger_email) as cumulative,
         round(100.0 * sum(replies_from_this) over (partition by kind order by trigger_email)
               / total_replies, 1) as cumulative_pct
    from per_step
   order by kind, trigger_email;

-- ---------------------------------------- reply speed by triggering email
-- Median and average hours between the last outbound and the inbound reply,
-- grouped by which email triggered it.
create or replace view an_reply_speed as
  with reply_timing as (
    select s.kind,
           max(case when st.status = 'sent' then st.step_no end) as trigger_email,
           max(case when st.status = 'sent' then st.sent_at end) as last_sent_at,
           min(case when e.direction = 'in' then e.sent_at end) as reply_at
      from sequence s
      join step st on st.sequence_id = s.id
      left join email_event e
        on e.contact_id = s.contact_id
       and e.company_id = s.company_id
       and e.direction = 'in'
     where s.status = 'replied'
     group by s.id, s.kind
  )
  select kind, trigger_email as step_no,
         count(*) as n,
         round(avg(extract(epoch from (reply_at - last_sent_at)) / 3600)::numeric, 1) as avg_hours,
         round((percentile_cont(0.5) within group (
           order by extract(epoch from (reply_at - last_sent_at)) / 3600))::numeric, 1) as median_hours
    from reply_timing
   where reply_at is not null and last_sent_at is not null and reply_at > last_sent_at
   group by kind, trigger_email
   order by kind, trigger_email;

-- ---------------------------------------- E1 reply rate weekly trend
-- Round 1 opener performance by week, for the last 12 weeks.
create or replace view an_e1_weekly_trend as
  with weekly as (
    select date_trunc('week', pt(st.sent_at))::date as week,
           count(*) as e1_sent,
           count(case when s.status = 'replied' then 1 end) as e1_replied
      from step st
      join sequence s on s.id = st.sequence_id
     where st.step_no = 1 and st.status = 'sent' and s.kind = 'first'
     group by 1
  )
  select week,
         e1_sent as sent,
         e1_replied as replied,
         round(100.0 * e1_replied / nullif(e1_sent, 0), 0) as rate
    from weekly
   where week >= pt_today() - interval '12 weeks'
   order by week;

commit;