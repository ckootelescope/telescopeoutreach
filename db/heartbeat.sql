-- The heartbeat: run records, and the send pacing that makes an unattended
-- sender possible. See OS-ARCHITECTURE.md sections 3 and 6.2.
--
-- Written 2026-09-23, after two Windows scheduled tasks were found to have been
-- failing every morning for months with nobody aware: one pointed at a script
-- deleted in July, the other had an unquoted path that Windows split at the
-- space in the user's name. Both reported "Ready". The exit codes were recorded
-- and never read.
--
-- Nothing else in the architecture is trustworthy without this table, because
-- without it a broken job and a quiet week look identical.

create table if not exists job_run (
  id          bigserial primary key,
  job         text        not null,          -- 'ear' | 'send' | 'queue' | 'health' | 'briefs'
  runner      text        not null,          -- 'robot' | 'analyst' | 'manual'
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null default 'running',
                                             -- running | ok | failed | skipped | throttled
  counts      jsonb,                         -- {sent:4, replies:2, bounced:0}
  error       text
);

create index if not exists job_run_job_started_idx on job_run (job, started_at desc);
create index if not exists job_run_status_idx      on job_run (status) where status = 'running';

comment on table job_run is
  'One row per automated run. The health pulse reads this to decide whether a job has gone quiet.';
comment on column job_run.status is
  'throttled is distinct from failed on purpose: a rate limit means try again shortly, a failure means look at it.';

-- Latest outcome per job, which is all the pulse actually needs.
create or replace view v_job_health as
  select distinct on (job)
         job, runner, status, started_at, finished_at, counts, error,
         round(extract(epoch from (now() - started_at)) / 60)::int minutes_ago
    from job_run
   order by job, started_at desc;

-- --------------------------------------------------------------------------
-- Send pacing moves into the database.
--
-- mo_send used to hold spacing in the process: send, sleep 4 to 7 minutes,
-- send again, for up to five hours. Any interruption killed the batch, and on
-- 2026-09-23 exactly that happened. Spacing now lives on the row, so a tick can
-- send what is due, stamp the next one, and exit in seconds. A crash costs
-- nothing because the next tick reads the same state.
--
-- Null send_after means "no pacing constraint", so every step staged before
-- this migration stays sendable and nothing needs backfilling.
--
-- The sending rules live here, not in mo_send, so every sender that reads this
-- view obeys them, including a CI shift still running older code:
--   * only a contact's next step, and never one below a step already sent, so a
--     backlog cannot send Email 4 and then Email 3
--   * at least two days since that contact's last send, so a backlog resumes at
--     the normal cadence instead of one email a tick
--   * one row at a time, so a tick sends one email and spacing is the tick gap
create or replace view market.v_due as
  select st.id step_id, st.contact_id, st.step_no, st.due_date, st.send_after,
         ct.project_id, ct.full_name, ct.first_name, ct.email, ct.angle,
         ct.company_name, p.slug project_slug, p.anchor_company, ct.linkedin_url
    from market.step st
    join market.contact ct on ct.id = st.contact_id
    join market.project p  on p.id  = ct.project_id
   where st.status = 'planned'
     and ct.status in ('active','queued')
     and ct.method = 'email'
     and st.due_date <= pt_today()
     and (st.send_after is null or st.send_after <= now())
     and st.step_no = (select min(x.step_no) from market.step x
                        where x.contact_id = st.contact_id and x.status = 'planned')
     and not exists (select 1 from market.step x
                      where x.contact_id = st.contact_id
                        and x.status in ('sent','sending')
                        and (x.step_no >= st.step_no
                             or x.status = 'sending'
                             or x.sent_at > now() - interval '2 days'))
   order by p.send_priority, st.step_no desc, st.due_date, st.contact_id
   limit 1;

comment on view market.v_due is
  'The one step a send tick may claim right now: next step only, 2+ days since the contact''s last send, project priority first.';
