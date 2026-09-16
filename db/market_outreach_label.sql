-- The subject line title-cases the industry ("Life Insurance") while paragraph 2
-- runs it lowercase in prose ("across the life insurance space"). One column
-- cannot serve both, and deriving one from the other gets "CPG" wrong.
alter table market.project add column if not exists industry_label text;
update market.project set industry_label = initcap(industry) where industry_label is null;
update market.project set industry_label = 'CPG' where slug = 'jampack-ai';
