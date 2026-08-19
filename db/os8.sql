-- Weekly OS, revision 8.
--
--   1. Hard to Crack gains the columns Calvin keeps in the sheet: step taken
--      this week, investors, city, conferences and his own notes. one_liner and
--      step_this_week are edited inline in the console, so a re-sync from
--      Affinity must never clobber them.
--
--   2. cadence_mode separates how a company is being worked:
--        auto    a sequence is running out of the outreach engine
--        manual  Calvin is emailing by hand, so the engine shows nothing
--        hold    an intro is coming later, so no action now and no nagging
--      Without this, a company being worked by hand looks abandoned and a
--      company deliberately parked looks overdue.
--
--   3. Once a company reaches Discovery it is no longer hard to crack, so it
--      drops off the list rather than sitting there looking done.
--
--   4. Tier 1 relationships Calvin does not want reminders for. Stephen at Hg
--      is a friend; surfacing him in a queue is noise, not help.
--
-- Apply:  node scripts/apply_sql.js db/os8.sql

alter table os_hard_to_crack add column if not exists step_this_week text;
alter table os_hard_to_crack add column if not exists investors text;
alter table os_hard_to_crack add column if not exists city text;
alter table os_hard_to_crack add column if not exists conferences text;
alter table os_hard_to_crack add column if not exists sheet_note text;
alter table os_hard_to_crack add column if not exists owner_initials text;
alter table os_hard_to_crack add column if not exists cadence_mode text not null default 'auto';
alter table os_hard_to_crack add column if not exists hold_reason text;

do $$ begin
  alter table os_hard_to_crack add constraint os_htc_mode
    check (cadence_mode in ('auto', 'manual', 'hold'));
exception when duplicate_object then null; end $$;

alter table os_investor_target add column if not exists no_reminder boolean not null default false;

-- ---------------------------------------------------------------------------
drop view if exists v_os_hard_to_crack;
create view v_os_hard_to_crack as
select h.*,
       (current_date - h.last_email_at) as days_since_email,
       co.id as company_id,
       s.status as sequence_status,
       s.round  as sequence_round,
       (select max(e.sent_at)::date from email_event e
         where e.company_id = co.id and e.direction = 'in') as last_reply_at,
       -- Only auto and manual companies can be behind. A hold is a decision.
       (h.cadence_mode <> 'hold'
        and (h.last_email_at is null or (current_date - h.last_email_at) > 21)) as needs_action
  from os_hard_to_crack h
  left join company_domain cd on cd.domain = h.domain
  left join company co on co.id = cd.company_id
  left join lateral (
    select sq.status, sq.round from sequence sq
     where sq.company_id = co.id order by sq.id desc limit 1
  ) s on true
 where h.active
   and coalesce(h.tp_status, '') <> 'Discovery';

-- Reminders skip anyone Calvin has asked not to be nagged about.
drop view if exists v_os_investor_queue;
create view v_os_investor_queue as
select t.*,
       os_tier_cadence(t.tier_num) as cadence,
       (current_date - t.last_outreach) as days_since,
       case
         when coalesce(t.relationship, 'none') in ('none', 'cold')
              and t.last_outreach is null                              then 'net_new'
         when t.tier_num = 5 or t.no_reminder                           then 'parked'
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
