-- ITC Vegas week: a project can override the computed subject line and the
-- step-1 call to action.
--
-- Both were hardcoded in mo_render because they were genuinely fixed: every
-- project asked for "a quick call in the next couple of weeks" under a
-- "Chat on <Industry> Software and AI Tools" subject. A conference breaks that.
-- The ask becomes a specific, dated, in-person one, and it stops being true a
-- week later, so it belongs on the project rather than in the renderer.
--
-- Null means "use the renderer default", so every other project is unaffected.
alter table market.project add column if not exists subject_override text;
alter table market.project add column if not exists cta_html text;

comment on column market.project.subject_override is
  'Replaces the computed "Telescope Partners | Chat on X Software and AI Tools" subject. Null = computed.';
comment on column market.project.cta_html is
  'Replaces the step-1 closing ask of paragraph 1. Null = "Are you free for a quick call in the next couple of weeks?".';
