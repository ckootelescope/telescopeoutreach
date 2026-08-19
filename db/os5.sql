-- Weekly OS, revision 5.
--
--   1. A company call only counts toward the weekly target if it is a NET NEW
--      conversation. A catch up with a company already in the pipeline is
--      valuable but it is not a new conversation, so counting it inflates the
--      number Calvin is actually trying to move.
--
--   2. os_investor_target becomes the running database of investor
--      relationships, seeded from the Notion Investor Pipeline. The whole point
--      of the tab is names Calvin has NOT spoken to, so the table has to know
--      who he has.
--
--      Two queues fall out of one table:
--        net new   -> no relationship yet, never contacted
--        catch up  -> active or warming, but the last touch has gone stale
--
--      A relationship that is current appears in neither. That is the correct
--      answer for someone he spoke to last week.
--
-- Apply:  node scripts/apply_sql.js db/os5.sql

-- ---------------------------------------------------------------------------
-- 1. Net new versus catch up on company calls.
--
-- Determined from the calendar title where it says so ("Intro", "Catch Up"),
-- otherwise from Affinity or the Granola company calls folder, otherwise left
-- unknown rather than guessed. Unknown does not count.
-- ---------------------------------------------------------------------------
alter table os_meeting_brief add column if not exists conversation_type text;

do $$ begin
  alter table os_meeting_brief add constraint os_brief_conv
    check (conversation_type is null
           or conversation_type in ('net_new', 'catch_up', 'unknown'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Relationship state on the investor table.
-- ---------------------------------------------------------------------------
alter table os_investor_target add column if not exists relationship text;
alter table os_investor_target add column if not exists last_outreach date;
alter table os_investor_target add column if not exists last_response date;
alter table os_investor_target add column if not exists next_action text;
alter table os_investor_target add column if not exists relevant_cos text;
alter table os_investor_target add column if not exists tier text;
alter table os_investor_target add column if not exists firm_type text;
alter table os_investor_target add column if not exists owner text;
alter table os_investor_target add column if not exists cadence_days int not null default 60;

do $$ begin
  alter table os_investor_target add constraint os_target_rel
    check (relationship is null
           or relationship in ('none', 'cold', 'warming', 'active', 'dormant'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
drop view if exists v_os_call_progress;
drop view if exists v_os_meeting;

-- Rebuilt to carry conversation_type through to the pages.
create view v_os_meeting as
select e.external_id, e.summary, e.starts_at, e.ends_at, e.day, e.location,
       e.attendees, e.status,
       to_char(e.starts_at at time zone 'America/Los_Angeles', 'HH12:MIam') as time_label,
       coalesce(b.category, 'other') as category,
       b.org, b.counterpart, b.title, b.one_liner, b.focus, b.deal,
       coalesce(b.conversation_type, 'unknown') as conversation_type,
       i.firm, i.invests_in, i.track,
       (b.external_id is null) as needs_brief
  from os_calendar_event e
  left join os_meeting_brief b on b.external_id = e.external_id
  left join os_investor i on i.id = b.investor_id;

-- Only net new conversations count. held is what has actually happened.
create view v_os_call_progress as
select w.week_of, w.calls_goal,
       count(*) filter (where m.category = 'company'
                          and m.conversation_type = 'net_new')                      as booked,
       count(*) filter (where m.category = 'company'
                          and m.conversation_type = 'net_new'
                          and m.status = 'done')                                    as held,
       count(*) filter (where m.category = 'company'
                          and m.conversation_type = 'catch_up')                      as catch_ups,
       count(*) filter (where m.category = 'company'
                          and coalesce(m.conversation_type, 'unknown') = 'unknown')  as unclassified
  from os_week w
  left join v_os_meeting m on m.day between w.week_of and (w.week_of + 4)
 group by w.week_of, w.calls_goal;

-- The investor tab, split into its two queues.
--
-- days_since is null for someone never contacted, which is exactly what makes
-- them net new. due_in counts down to the next touch for a live relationship.
create or replace view v_os_investor_queue as
select t.*,
       (current_date - t.last_outreach) as days_since,
       case
         when coalesce(t.relationship, 'none') in ('none', 'cold')
              and t.last_outreach is null                          then 'net_new'
         when coalesce(t.relationship, 'none') in ('active', 'warming', 'dormant')
              and t.last_outreach is not null
              and (current_date - t.last_outreach) >= t.cadence_days then 'catch_up'
         when coalesce(t.relationship, 'none') in ('active', 'warming')
                                                                    then 'current'
         else 'net_new'
       end as queue,
       case when t.last_outreach is null then null
            else t.cadence_days - (current_date - t.last_outreach) end as due_in
  from os_investor_target t
 where t.status <> 'skip';
