-- Weekly OS, revision 6.
--
--   1. Tier drives cadence. Calvin's scale, in his words:
--        1  every month     very relevant, maintain actively
--        2  every quarter   relevant, not needed regularly
--        3  every 6 months  likes them, no need for frequent contact
--        4  once a year     check in occasionally
--        5  never           deprioritised, no catch up needed
--      cadence_days is now derived from tier rather than set per person, so
--      re-tiering somebody automatically re-times them.
--
--   2. Someone spoken to but with no recorded date is its own state. Guessing a
--      date would silently make them look current or overdue; saying the date is
--      unknown is the honest answer and is actionable.
--
--   3. os_deal_share mirrors the Slack #deal-sharing channel so the list is on
--      screen during investor calls, which is what it is actually for.
--
-- Apply:  node scripts/apply_sql.js db/os6.sql

alter table os_investor_target add column if not exists tier_num int;

do $$ begin
  alter table os_investor_target add constraint os_target_tier
    check (tier_num is null or tier_num between 1 and 5);
exception when duplicate_object then null; end $$;

-- Tier 5 has no cadence at all. Null means never chase.
create or replace function os_tier_cadence(t int) returns int as $$
  select case t
           when 1 then 30
           when 2 then 90
           when 3 then 180
           when 4 then 365
           when 5 then null
           else 90
         end;
$$ language sql immutable;

-- ---------------------------------------------------------------------------
-- Deals we are circulating. Straight from #deal-sharing.
-- ---------------------------------------------------------------------------
create table if not exists os_deal_share (
  id         bigserial primary key,
  company    text not null,
  what       text,
  arr        text,
  growth     text,
  efficiency text,
  source     text,
  detail     text,
  url        text,
  shared_by  text,
  shared_at  timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company)
);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
drop view if exists v_os_investor_queue;
create view v_os_investor_queue as
select t.*,
       os_tier_cadence(t.tier_num) as cadence,
       (current_date - t.last_outreach) as days_since,
       case
         -- never spoken to: the point of the tab
         when coalesce(t.relationship, 'none') in ('none', 'cold')
              and t.last_outreach is null                              then 'net_new'
         -- deprioritised: never surfaces for a catch up
         when t.tier_num = 5                                            then 'parked'
         -- spoken to, but nobody wrote down when
         when coalesce(t.relationship, 'none') <> 'none'
              and t.last_outreach is null                              then 'undated'
         when t.last_outreach is not null
              and os_tier_cadence(t.tier_num) is not null
              and (current_date - t.last_outreach) >= os_tier_cadence(t.tier_num)
                                                                        then 'catch_up'
         when t.last_outreach is not null                               then 'current'
         else 'net_new'
       end as queue,
       case when t.last_outreach is null or os_tier_cadence(t.tier_num) is null then null
            else os_tier_cadence(t.tier_num) - (current_date - t.last_outreach) end as due_in
  from os_investor_target t
 where t.status <> 'skip';

create or replace view v_os_deal_share as
select * from os_deal_share where active order by shared_at desc nulls last, company;
