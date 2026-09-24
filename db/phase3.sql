-- Phase 3 of OS-ARCHITECTURE.md: the home page becomes a front door.
--
-- "Open the laptop, see the day, and walk into every call already prepared."
--
-- os_meeting_brief already existed with the right shape: category, org,
-- counterpart, one_liner, focus, and a link to the company or investor. What it
-- did not have was the three questions Calvin actually wants, or any record of
-- where a brief came from. Every one_liner in the table is an empty string,
-- because nothing ever filled them.
--
-- So this extends that table rather than adding a second one. A second briefs
-- table would have meant two places to look and a merge nobody maintains.

alter table os_meeting_brief add column if not exists questions    jsonb;
alter table os_meeting_brief add column if not exists sources      jsonb;
alter table os_meeting_brief add column if not exists generated_at timestamptz;
alter table os_meeting_brief add column if not exists generated_by text;
alter table os_meeting_brief add column if not exists prep_note    text;

comment on column os_meeting_brief.questions is
  'Exactly three, as a JSON array of strings. Three is the point: a list of ten is a document nobody reads walking into a call.';
comment on column os_meeting_brief.sources is
  'What the brief was built from, e.g. ["granola:expert calls/pharmacy", "gmail:thread 19f...", "harmonic"]. Shown in the UI on purpose: a brief whose provenance is invisible does not get trusted, and an untrusted brief gets ignored.';
comment on column os_meeting_brief.generated_by is
  'analyst | calvin. A human edit should never be silently overwritten by the next run.';

-- ===========================================================================
-- What the home page reads: today's calls, each with its brief if one exists.
create or replace view v_os_call_brief as
  select e.external_id,
         e.summary,
         e.starts_at,
         e.ends_at,
         (e.starts_at at time zone 'America/Los_Angeles')::date  call_date,
         to_char(e.starts_at at time zone 'America/Los_Angeles', 'HH12:MIam') start_label,
         e.attendees,
         e.location,
         coalesce(b.category, 'other')                            category,
         b.conversation_type,
         b.org,
         b.counterpart,
         b.one_liner,
         b.focus,
         b.questions,
         b.sources,
         b.prep_note,
         b.company_id,
         b.investor_id,
         b.generated_at,
         b.generated_by,
         -- A brief is ready when it has both halves. one_liner alone is a label,
         -- three questions alone is a quiz.
         (b.questions is not null
          and jsonb_array_length(coalesce(b.questions,'[]'::jsonb)) >= 3
          and coalesce(b.one_liner,'') <> '')                     brief_ready,
         -- Internal meetings and social events do not need prep. Saying so
         -- explicitly keeps them off the "missing brief" list forever.
         (coalesce(b.category,'other') in ('company','expert','investor'))
                                                                  needs_brief
    from os_calendar_event e
    left join os_meeting_brief b on b.external_id = e.external_id
   where coalesce(e.status,'confirmed') <> 'cancelled';

comment on view v_os_call_brief is
  'Every calendar event with its brief. brief_ready means it can be walked into; needs_brief means it should have one.';

-- ===========================================================================
-- The Analyst''s work list: calls soon that should have a brief and do not.
--
-- Deliberately a view rather than a script argument, so the routine that
-- generates briefs and the page that displays them agree on what is missing.
create or replace view v_brief_queue as
  select external_id, summary, starts_at, start_label, call_date,
         category, org, counterpart, company_id, investor_id, attendees,
         round(extract(epoch from (starts_at - now())) / 3600)::int hours_away
    from v_os_call_brief
   where needs_brief
     and not brief_ready
     and starts_at between now() - interval '2 hours' and now() + interval '48 hours'
   order by starts_at;

comment on view v_brief_queue is
  'Calls within 48 hours that need a brief and do not have one. What the Analyst works from.';
