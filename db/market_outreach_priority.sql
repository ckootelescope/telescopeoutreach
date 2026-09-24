-- Which project's due steps go out first when the daily cap cannot cover them all.
-- Lower sends first. Ties fall back to the per-step ordering in mo_send.js.
-- Set 2026-09-24: Calvin wants Pathwork ahead of InStockRx.
alter table market.project add column if not exists send_priority int not null default 100;

update market.project set send_priority = 10 where slug = 'pathwork';
