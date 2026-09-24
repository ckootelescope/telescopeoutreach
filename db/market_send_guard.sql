-- The last line of defence for market sends. Every sender must move a step from
-- 'planned' to 'sending' before it touches Gmail. This trigger refuses that move
-- when it would break the cadence, whatever code or query asked for it, so no
-- script, deploy, manual run or future change can send out of turn.
--
-- Refused (the update is silently skipped, and mo_send reads that as "not mine"):
--   * an earlier step for the same contact is still unsent
--   * the same or a later step for that contact was already sent
--   * that contact was emailed in the last 2 days
--   * any market email went out in the last 4 minutes
create or replace function market.send_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from market.step x
              where x.contact_id = new.contact_id and x.id <> new.id
                and ((x.status = 'planned' and x.step_no < new.step_no)
                  or (x.status in ('sent','sending') and x.step_no >= new.step_no)
                  or (x.status = 'sending')
                  or (x.status = 'sent' and x.sent_at > now() - interval '2 days')))
     or exists (select 1 from market.step x
                 where x.id <> new.id
                   and (x.status = 'sending'
                     or (x.status = 'sent' and x.sent_at > now() - interval '4 minutes'))) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists step_send_guard on market.step;
create trigger step_send_guard
  before update of status on market.step
  for each row
  when (old.status = 'planned' and new.status = 'sending')
  execute function market.send_guard();
