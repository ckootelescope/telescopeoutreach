-- A project's opener subject can change mid-campaign. Pathwork's first batch
-- went out as "Chat on Insurance Distribution Software" before the wording was
-- retired on 2026-09-14, so a backfill that searches only the current subject
-- silently misses 16 of 46 people who were genuinely emailed.
alter table market.project add column if not exists alt_subjects text[];

update market.project
   set alt_subjects = array['Telescope Partners | Chat on Insurance Distribution Software']
 where slug = 'pathwork';
