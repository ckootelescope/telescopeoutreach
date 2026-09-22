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

-- Corrected 2026-09-21: the ITC framing belongs to a batch of contacts, not to
-- the project. Setting it on market.project swept in 35 people who were staged
-- days earlier for ordinary outreach and had nothing to do with the conference.
-- Contact wins over project wins over the renderer default.
alter table market.contact add column if not exists subject_override text;
alter table market.contact add column if not exists cta_html text;

comment on column market.contact.subject_override is
  'Per-contact subject, beats project.subject_override. Use for a batch with its own framing.';
comment on column market.contact.cta_html is
  'Per-contact step-1 ask, beats project.cta_html.';

-- A cohort can also carry its own Email 2. The fixed template asks for a call
-- "next week", which is wrong once the whole cadence sits inside a conference.
alter table market.contact add column if not exists step2_html text;
comment on column market.contact.step2_html is
  'Per-contact Email 2 body, beats the fixed template in mo_render. [First] is substituted.';
