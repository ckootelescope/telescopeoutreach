-- Weekly OS, revision 4.
-- Reference calls are their own thing: a customer reference on a live deal is
-- not the same as an expert-network call, and Calvin labels them apart in
-- Google Calendar already.
alter table os_meeting_brief drop constraint if exists os_meeting_brief_category_check;
alter table os_meeting_brief add constraint os_meeting_brief_category_check
  check (category in ('company', 'investor', 'expert', 'reference', 'internal', 'other'));
