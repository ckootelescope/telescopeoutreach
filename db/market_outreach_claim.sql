-- Two concurrent mo_send processes both read a step as 'planned', both sent it,
-- and both wrote the row. One row, two real emails: Anna Patrick and Jake
-- Christensen each received the same follow-up twice, eight minutes apart.
--
-- 'sending' is the claim. A sender now flips planned -> sending in a single
-- atomic UPDATE and only proceeds if it won the row, so a second process finds
-- nothing to claim no matter how many are racing. A file lock cannot guarantee
-- this; the database can.
alter table market.step drop constraint if exists step_status_check;
alter table market.step
  add constraint step_status_check
  check (status in ('planned','sending','sent','cancelled','skipped','failed'));
