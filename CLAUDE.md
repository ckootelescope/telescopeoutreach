# Telescope Outreach System

## Where The Tracker Lives

**"The tracker" means the Supabase Postgres database and the Vercel app built on it.**
When Calvin says **"update"**, **"refresh"**, or **"the tracker"**, that is what he means,
in every session, with no exceptions. He never means the Google Sheets analytics tracker.
Sheets are read as source data only; nothing is ever written back to them.

The app is **Telescope OS**: Dashboard, Week, Hard to Crack, Investors, Outreach.

- Connection string: `SUPABASE_DB_URL` in `.env`. Check it with `node scripts/db.js`.
- Schema: `db/schema.sql`. Tables are `company`, `company_domain`, `contact`, `sequence`,
  `step`, `email_event`, `prior_check`. Reporting views are `dash_*`, `an_*`, and `v_*`
  (defined in `db/views.sql`, `db/dashboard.sql`, `db/analytics.sql`).
- Console: Next.js app in `web/`, deployed on Vercel with root directory `web`. Read-only.
  Its queries live in the database as views, so the app stays a rendering layer.
- Dates are stored at 07:00Z, which is midnight Pacific. Measure "today" in Pacific.

`followups.json` is **not** the tracker. It is a secondary mirror that the scheduled
routine reads from the remote copy. The scripts below write Supabase and `followups.json`
together so the two cannot drift. Always push `followups.json` after a script changes it.

The Google Apps Script sheet (`analytics/Code.gs`, the `script.google.com/macros/...` exec
URL) is **dead** and superseded by Supabase. Its endpoint returns "Page Not Found". Do not
try to log there.

### Never hand-write SQL for routine work

Use the repo's scripts. Every one is report-only by default and takes `--apply`. Run the
report first, read it, then apply.

| Task | Command |
|---|---|
| Connectivity + table list | `node scripts/db.js` |
| Mark steps sent (reconciled from Gmail) | `node scripts/mark_sent.js [--apply]` |
| Record replies, stop cadences for repliers | `node scripts/sync_replies.js [--apply]` |
| Open a Round 1 cadence whose opener already went out | `node scripts/new_cadence.js <file.json> [--apply]` |
| Kill every live cadence for a company | `node scripts/cancel_sequence.js <domain> "<reason>" [--apply]` |
| Record a Round 2 restart | `node scripts/restart_cadence.js` |
| Sweep observed mail into `email_event` | `node scripts/mail_sweep.js` |

`mark_sent.js` decides "sent" from the mailbox, not from whether a draft was created, so a
step Calvin sent by hand still reconciles. `sync_replies.js` correctly ignores
out-of-office auto-replies; do not treat an OOO bounce as a reply.

Scripts under `scripts/` that talk to the Google Sheet or the Gmail draft API
(`log_sent_and_recreate_drafts.js`, `delete_drafts.js`, `log_tracker.js`, `sheet_io.js`,
`read_tracker.js`) are legacy from the pre-Supabase system. Do not use them.

## Two Engines: Route First

There are two separate sequences. **Never guess which one applies from the wording of the
request.** Always check `followups.json` for the domain first, then route:

| State of the company | Engine | Command |
|---|---|---|
| No prior outreach anywhere | Round 1, net new | `/outreach <url>` |
| Prior cadence went cold (no reply, stale) | Round 2, restart | `/restart-outreach <domain>` |
| Cadence live right now (`pending` entries) | Neither | Report next send date, stop |
| Founder ever replied | Neither | Stop. Never re-cold-email a responder. |

The two engines differ in cadence, subject line, and every line of copy:

|  | Round 1 | Round 2 |
|---|---|---|
| Cadence | Day 0/+2/+7/+12 | Day 0/+2/+5/+10 |
| Subject | `Telescope <> [Company] Intro` | `Telescope Intro (Sequoia Spinout) - Let's Chat?` |
| Email 1 | 3 blocks, company-specific insight | Fixed paras 1 and 3, theme-matched para 2 |
| Emails 2/3 | Fixed templates | Personalized, drafted at due time |
| Email 4 | Semi-templated, new insight | Fully fixed template |
| LinkedIn reminder | Yes | No, already connected |

If Calvin's phrasing points one way but the data points the other, **say so and ask.** The worst
failure in this system is sending a first-contact opener to a founder who has already had four
emails.

## What You Do

When Calvin says "outreach to [URL]" or "reach out to [company]", YOU handle everything end-to-end. Calvin provides ONLY a company URL. You do the rest. DO NOT ask Calvin to provide contact details, email bodies, JSON, thread IDs, or any other data. You find and generate ALL of that yourself.

## MCP Servers

- **Harmonic** — company data, founder info, funding, headcount
- **Apollo.io** — founder email enrichment (apollo_people_match with first_name, last_name, domain)
- **Affinity** — CRM, check for prior Telescope interactions
- **Superhuman Mail** — create email drafts (create_or_update_draft, type "new", body as HTML)
- **Gmail** — search sent threads for thread IDs after Calvin sends
- **Google Calendar** — create LinkedIn connection reminders

## Step-by-Step Execution

### Step 1: Research (RUNS IN A SUBAGENT)

**This step MUST run in a separate subagent (Agent tool).** The subagent does all MCP lookups and returns ONLY a structured Writing Brief. Founder career history, resume data, prior companies, and website marketing copy never enter the main writing context.

The research subagent performs:
a) **Web search** the company AND **fetch their website** to understand what they actually do
b) **Harmonic get_companies** with website domain (field_groups: name_id_description_headcount_website, funding, founders_ceo, highlights, location, contact)
c) **Affinity search_companies** with company name, with_interaction_dates: true
   - Within 90 days → return affinity_block: true with details so main context can ask Calvin
   - Prior history (>90 days) → check WHO was contacted at the person level
d) **Apollo apollo_people_match** for founder email + LinkedIn if Harmonic doesn't have them
e) Multiple founders → default to CEO. Ambiguous → return all names so main context can ask Calvin.
f) **Granola sweep on the market** (see "Market Pattern Insights"). Query Expert Calls and
   Company Calls by market, not company name. Return 2-3 patterns, already generalized: the
   third party stripped, no numbers, no attribution. Return an empty array if the market is not
   covered rather than reaching for a weak match.

Founder LinkedIn post content is not fetchable. Do not spend calls on it. Company blogs,
changelogs, engineering posts, docs and podcast pages are all fetchable and are the best public
source; read the blog if one exists.

**CRITICAL: Always verify what the company actually does by reading their website. Do NOT rely on Harmonic descriptions alone.**

#### Writing Brief (the ONLY output the subagent returns)

```
company_name: [name]
domain: [domain]
what_they_do: [2-3 sentences in plain language. What the company does AND what problem/workflow they're replacing. Enough context to develop a thesis-level insight about where the company could go. NO marketing copy, NO jargon.]
founder_first_name: [first name]
founder_last_name: [last name]
founder_email: [email]
founder_linkedin: [URL]
real_calvin_connections: [ONLY: shared school (CMC, Claremont, Harvard-Westlake), shared industry (Calvin's Sunstone tech-services background), someone Calvin actually knows. If none, leave blank.]
portfolio_tie_in: [relevant Telescope portfolio company or team member connection, if any. If none, leave blank.]
affinity_status: [no prior interaction / prior interaction >90 days with details / BLOCKED within 90 days]
affinity_spoken: [yes/no — has someone on the Telescope team actually HAD A CONVERSATION with this company (meeting/call), not just sent an outbound email]
funding_stage: [last known round + amount, if public. If unknown, leave blank.]
trigger: [specific recent event like partnership, funding announcement, expansion. If none, leave blank.]
headcount: [approximate, if known]
market: [the market to sweep Granola on, e.g. "industrial distribution", "application security"]
market_patterns:
  - pattern: [how companies in this market get bought, adopted or expanded. Generalized.]
    failure_mode: [the contrast. "The ones that stall..."]
  - [2-3 total. Empty if the market is not covered in Calvin's calls.]
research_grade: [A = a usable market pattern plus a primary source read. B = one of the two.
                 C = neither, only Harmonic deltas. Do NOT draft on a C; surface it to Calvin.]
```

`trigger` and `headcount` are context for Calvin, **not** material for the email. Never lead
Block 2 with either.

**The subagent MUST NOT return:** founder's career history, prior companies, prior exits, education (unless shared school with Calvin), LinkedIn summary, job titles at previous companies, quotes from press, website copy, technical product descriptions.

### Step 2: Draft Email

The email has three blocks. Lead with the CTA and who Telescope is in the first 3-4 lines. Then the insight. Then the close.

#### Block 1: Opener + CTA + Telescope Intro (SEMI-FIXED)

Personalized greeting, CTA to chat, and Telescope intro all upfront in the first paragraph.

> Hey [First Name] - I love what you're building at [Company] and wanted to see if you're free to chat next week? We're a Series A fund led by Mickey Arabelovic (former Sequoia partner) focused on B2B software and AI. We're on our third fund ($275M) and lead $5-30M rounds in a handful of founders each year.

The greeting can be personalized. If someone on the team has SPOKEN to the company, reference that prior conversation. The Telescope intro is always included. The CTA ("free to chat next week?") should always be in the first sentence or two.

#### Block 2: Insight (VARIABLE — the creative part)

This is the only variable block. Blocks 1 and 3 are fixed; all content goes here.

**Build it in four moves.** This structure also drives Round 1 Email 4 paragraph 2 and Round 2
Emails 2 and 3. See "Market Pattern Insights" below for the sourcing and the hard rules.

1. **Earned position.** "We've been spending a lot of time in [market]" — establishes you have
   a view without proving anything.
2. **The pattern.** What you have observed about how companies in this market actually get
   bought, adopted, or expanded. A pattern, not a fact.
3. **The failure mode.** The contrast. "The ones that stall..." This is the hook, because it
   implies knowledge you have not fully shared.
4. **The company tie-in.** "I think [Company] is interesting though because [the specific thing
   they do], and [why that puts them on the right side of the pattern]."

Move 4 is not optional. A pattern with no tie-in reads as a generic market take and is the most
common failure of this block. Naming what the company **does** is correct and expected. What is
banned is leading with their metrics, funding, headcount, traffic, or a press quote.

**Example (Pensar):** "We've been spending a lot of time in security testing and the pattern we
keep seeing is that the products that land run alongside the incumbent scanners, while the ones
that stall need a new budget line to exist before they can prove anything. I think Pensar is
interesting though because selling a verified fix rather than another report means you can come
out of the pentest budget that's already approved, which is usually the path of least resistance
into a security team."

**Example (Vimes):** "We've been spending a lot of time in public safety software and the pattern
we keep seeing is that a compliance requirement gets you in the door, but the account only gets
big when the same system starts carrying the operational work around it. The ones that stall treat
the mandate as the whole product. I think Vimes is interesting though because routing a case
between police, CPS, schools and an advocacy center means you end up holding the one timeline none
of those agencies can see on their own, and that's the part that's hard to displace later."

**If no market pattern is available** (see the coverage note below), fall back to a thesis-level
structural insight about the company drawn from the matched investment theme. Do not invent a
pattern, and do not fabricate having spent time in a market.

#### Block 3: Close (FIXED, updated 2026-08-17)

> I'd love to chat to see where Telescope can be helpful even if you're not raising now. LMK if you're free in the next couple of weeks or if another time works better. Here's my Calendly link if helpful!

The word **Calendly** is hyperlinked to `https://calendly.com/calvin-telescopepartners/30min`. In HTML:

```html
<div>I'd love to chat to see where Telescope can be helpful even if you're not raising now. LMK if you're free in the next couple of weeks or if another time works better. Here's my <a href="https://calendly.com/calvin-telescopepartners/30min">Calendly</a> link if helpful!</div>
```

Do not reword this block. The older close ("I'd love to chat even if you aren't raising immediately
and see how we can help out. LMK your thoughts!") is retired. It may still reference timing
("know you just raised, but would be good to see if there could be a fit ahead of the next round")
as an added sentence, but the close itself stays as written.

#### Rules

- Blank line between each block
- NO sign-off (Superhuman signature handles it)
- NO em dashes (-- or —). Use commas or periods.
- NO jargon or website language
- NO AI-sounding phrases ("the fact that...", "is especially compelling", "gives you a strong foundation", "says a lot about the team")
- NO quoted facts or metrics as the hook. No "you grew from 7 to 11 people", no "2.3M price
  recommendations", no "congrats on the $4M". Specificity of that kind is what makes an email
  read as machine-written. The specificity should be in the *pattern* and in *what the company
  does*, never in numbers scraped off a page.
- Subject line: "Telescope <> [Company] Intro" (or reference a trigger like "congrats on the raise | Telescope intro")

### Market Pattern Insights

Where the middle-block content comes from. **This applies to exactly four slots:**

| Engine | Slot |
|---|---|
| Round 1 | Email 1, Block 2 |
| Round 1 | Email 4, paragraph 2 (weighted to the GTM pattern) |
| Round 2 | Email 2 |
| Round 2 | Email 3 |

Round 1 Emails 2 and 3 stay fixed templates. Round 2 Email 1 keeps its theme-matched thesis and
Round 2 Email 4 stays fixed. Do not apply this to those.

#### Sourcing: sweep Granola, matched on market

Calvin's own calls are the best source and are better than web research, because they contain
customer behavior and GTM learnings that are not published anywhere. Two folders matter:
**Expert Calls** and **Company Calls**.

```
mcp__claude_ai_Granola__list_meeting_folders          -- folder IDs
mcp__claude_ai_Granola__query_granola_meetings        -- natural-language sweep
```

Query on the **market, not the company name.** The target has almost certainly never been
discussed; the value is in what adjacent calls taught us. Ask for how companies in that market
land deployments, what makes adoption stick or stall, how accounts expand, and what buyers do
before they commit. `mcp__claude_ai_Fathom__search_meetings` and Affinity
`get_notes_for_entity` → `get_transcript_fragments` are secondary sources for the same thing.

#### Confidentiality: this is the part to get right

These are private calls, often with companies that compete with the target. **Generalize to a
pattern and strip the source at write time, not at draft time.**

- NEVER name or characterize another company from the notes.
- NEVER carry over another company's numbers: ACV, pricing, headcount, conversion rates,
  customer names.
- NEVER attribute ("a founder told us", "an expert we spoke with said"). State it as Calvin's
  own market view, which it truthfully is.
- The claim "we've been spending a lot of time in [market]" must be **true**. It is, when the
  sweep returned real calls in that market. It is not, when the sweep came back empty.

#### Coverage is uneven, and that is fine

Deep today: manufacturing, industrial distribution, procurement, application security,
enterprise workflow automation and AI agents. Thin or absent: aviation, govtech, wealth
management, insurance, travel and tours.

When the sweep returns nothing usable for a market, say so and fall back to the theme-based
insight. Grade the dossier and **refuse to draft on a C**; surface it to Calvin instead of
shipping something thin. Inventing a pattern, or claiming time in a market Calvin has not spent
time in, is worse than a plain thematic email.

### Step 3: Send to Superhuman Drafts

Use Superhuman MCP create_or_update_draft:
- type: "new"
- to: [founder's email]
- subject: subject line
- body: email as HTML (div tags, br for line breaks)

**CRITICAL: Every Superhuman draft MUST have `to` set to ONLY the founder's email. Never include calvin@telescopepartners.com in the `to` field.**

Tell Calvin: "Draft created for [Founder] at [Company]. Review in Superhuman and send when ready. LinkedIn: [URL]"

### Step 4: After Calvin Says He Sent It

Do NOT hand-write the cadence. `scripts/new_cadence.js` creates company, contact, sequence,
all four steps, the `prior_check` row, and the outbound `email_event` in one transaction,
and writes `followups.json` too.

a) Find the sent thread. Gmail: `search_threads("from:me in:sent newer_than:2d to:{founder_email}")`
   for the thread ID and message ID. Superhuman uses the same thread ID on these threads.
b) Write an input file (e.g. `_new.json`) as an array of objects:

```json
[{
  "company": "Acme",
  "domain": "acme.com",
  "alt_domain": "getacme.com",
  "founder": "Jane Doe",
  "email": "jane@acme.com",
  "linkedin": "https://www.linkedin.com/in/janedoe",
  "sent_on": "2026-08-17",
  "sent_at": "2026-08-17T18:17:44Z",
  "thread_id": "1a010f19835b58b6",
  "message_id": "1a010f19835b58b6",
  "prior_check": "no prior Telescope interaction on record",
  "opener_html": "<div>the Email 1 that actually went out</div>",
  "p2": "the Email 4 paragraph-2 insight (see Email 4 below)"
}]
```

   `alt_domain` and `subject_override` are optional. Subject defaults to
   `Telescope <> [Company] Intro`. Emails 2 and 3 are generated from the fixed templates;
   only `p2` needs writing. Store the real opener in `opener_html` so "what did we actually
   say" never requires a mailbox dig.
c) `node scripts/new_cadence.js _new.json` to report, read it, then `--apply`.
   Dates come out as Day 0/+2/+7/+12 automatically. The script refuses a company that
   already has a live sequence, and a database trigger refuses to open a sequence against
   anyone who has ever written back.
d) Git add, commit, and push `followups.json` — the scheduler reads the remote copy.
e) Create LinkedIn calendar reminder (Step 5)
f) Tell Calvin: "Cadence opened. Email 2 on [date], Email 3 on [date], Email 4 on [date]."

### Step 5: LinkedIn Integration

Create Google Calendar event:
- Title: "LinkedIn Connect: [Founder] — [Company]"
- Date: same day or next day after Email 1
- Time: 9:00 AM PT
- Description: LinkedIn URL + suggested connection note

Suggested note: "Hey [Name] — just sent you a note about [Company]. Would love to connect here too."

Full cadence: Day 0 Email 1 + LinkedIn, Day 2 Email 2, Day 7 Email 3, Day 12 Email 4.

## Follow-up Emails

Follow-ups are reply-threaded. No sign-off on any (Superhuman handles it).

### Email 2 (+2 days) — FIXED TEMPLATE

> Hey [First Name] - wanted to follow up to see if you're free to connect in the next couple of weeks? Would love to see where Telescope can help out with what you're building.

### Email 3 (+7 days) — FIXED TEMPLATE

> Hey [First Name] - following up - how have you been thinking about your next raise? I really like what you're building at [Company] and would love to develop a relationship ahead of any future fundraise. We like getting to know founders and developing the relationship to make sure it's a good fit for both parties. However, LMK if I'm off the mark here - would love to get your thoughts regardless.

### Email 4 (+12 days) — SEMI-TEMPLATED

Four paragraphs. Paragraphs 1, 3, and 4 are fixed. Paragraph 2 is a NEW insight (different from Email 1) about the company plus how Telescope can specifically help.

**Paragraph 1 (fixed):**
> Hey [First Name] - hope you've been well. Wanted to follow up again because I'm confident that we can be valuable in what you're building.

**Paragraph 2 (variable — a GTM pattern + Telescope value-add):**

Use the four-move structure from Block 2, but **weighted to the GTM pattern** rather than to the
product: how companies in this market land, convert pilots, expand accounts, or stall. It must be
a different pattern from the one used in Email 1, since paragraph 3 already carries the
Telescope-can-help line. Same sourcing and confidentiality rules as "Market Pattern Insights".

Example (GTM-weighted): "We've been spending a lot of time in industrial distribution and the
thing that decides these deals is almost never the demo, it's whether a buyer can watch it run on
their own RFQs first. The teams that lead with a polished demo tend to stall in evaluation. I
think you're set up well for that because the quoting workflow is easy to prove on a customer's
own inbox before anyone has to commit to anything."

Older example, kept for tone reference only (predates the pattern structure): "I think Grantd is
solving a clear pain point for RIAs by helping them deliver scalable equity compensation advice to
clients with growing exposure to RSUs and equity grants. Over time, the data and workflow layer
could also support a broader enterprise platform for helping employees manage their equity."

**Paragraph 3 (fixed):**
> This is a pattern we're really familiar with - helping software and AI companies accelerate GTM once they have a strong initial wedge, while using our operations team to expand the product into a broader platform. Telescope was built around Mickey's experience at Sequoia helping Seed and Series A companies scale beyond the early stage.

**Paragraph 4 (fixed):**
> I'm not sure how you're thinking about fundraising, but I'd love to connect ahead of time and start building a relationship. We think about these partnerships over multiple years and really value working with high-quality folks. I'm happy to reach out later if it works better, but LMK your thoughts.

## Restart Outreach (Round 2)

Everything above describes Round 1 for a company never contacted before. Companies whose first
cadence went cold get a **second cadence**, which Calvin curates manually from his Affinity
Active Outreach view.

Round 2 is a different sequence, not a repeat: **Day 0/+2/+5/+10**, its own subject line
(`Telescope Intro (Sequoia Spinout) - Let's Chat?`), a fixed Email 4, and an Email 1 whose middle
paragraph is a theme-matched thesis rather than a company-specific observation.

- Run it with `/restart-outreach <domain>` — see `.claude/commands/restart-outreach.md`
- Investment themes for the Email 1 insight live in `investment-themes.md`. Load only the one
  matched theme, never all nine.
- Research dossiers are cached at `research/<slug>.json` and reused across Emails 1, 2, and 3.
  One research pass per company per round.
- Never restart a company that ever replied, and never restart one on the Affinity
  **Hard-To-Crack** view. That view overlaps Active Outreach, so it must be checked explicitly
  rather than assumed disjoint.

## Follow-up Processing

1. **Manual:** Calvin runs `/process-followups`
2. **Scheduled:** A Claude Code routine runs daily (~8am PT) with the same logic

Both work off Supabase. What is due comes from the `v_due` view, not from scanning
`followups.json`. See `.claude/commands/process-followups.md`.

The scheduled run and a manual run can collide. If a `git push` is rejected, do not force.
Fetch, diff your `followups.json` against `origin/main` semantically (compare entries by
slug + email number + send date), keep the superset, then commit and push.

### Reading state

```sql
select * from v_due;               -- steps due now
select * from dash_work_queue;     -- what needs a human
select * from v_awaiting_reply;    -- sent, no reply yet
select * from dash_broken_state;   -- sequences in an impossible state
select * from an_net_new_weekly;   -- the console's "Net new this week" tile
```

Weekly figures (`v_weekly`, `dash_weekly`, `an_net_new_weekly`) are **views computed from
the data**. A new week needs no manual rollover. If the current week looks empty or stale on
the console, the cause is that the week's sends and replies have not been recorded yet, so
run `mark_sent.js` and `sync_replies.js` rather than editing anything.

### followups.json entry format

The scripts maintain this; you should rarely write it by hand.

```json
{
  "slug": "company-slug",
  "company": "Company Name",
  "founder": "Founder Name",
  "email": "founder@company.com",
  "domain": "company.com",
  "threadId": "gmail-thread-id",
  "superhumanThreadId": "superhuman-thread-id",
  "messageId": "gmail-message-id",
  "subject": "Email Subject Line",
  "body": "<div>HTML email body</div>",
  "emailNumber": 2,
  "sendDate": "2026-07-15",
  "status": "pending"
}
```

ALWAYS push `followups.json` to remote immediately after a script changes it.

## Cancel Outreach

```
node scripts/cancel_sequence.js <domain> "<reason>" [--status=passed] [--apply]
```

This cancels the open steps in Supabase and the matching `followups.json` entries together,
so the scheduler cannot resurrect a sequence the database thinks is dead. Then push
`followups.json`.

## Guardrails

- 90-day Affinity overlap: STOP and ask Calvin
- Person-level verification for prior contacts
- Bounce/reply detection in follow-up processing

## Portfolio References

- Construction: Harrison Doyle (Head of Ops) is ex-Procore VP of Finance
- General: Mickey (our founder) was a Partner at Sequoia for 8 years
- Security: Chris worked with Axonius, JumpCloud
- Infrastructure: Chris worked with Datadog
- PLG: Chris worked with Calendly, Expensify, Otter AI
- Legal: Chris worked with Persuit, Logikcull
- Mfg/Supply Chain: Chris worked with Parabola, Paperless Parts, Project44
- Vertical SaaS: Chris worked with ShopGenie, PartsTech, Mangomint, VTS
- GTM/Enablement: Chris worked with Lessonly, Highspot, Voiceflow
- MSP: Chris worked with Rewst, Auvik
- E-commerce: Chris worked with Postscript, Chargeflow
- AI infra: Chris worked with DataRobot
- SMB: Chris worked with ZenBusiness
- Healthcare: Telescope includes Passage Health, Canid, Carefeed
- Insurance: Chris worked with iLife, family at State Farm
- Travel: Telescope includes Engine
- Fundraising: Telescope includes FundraiseUp, Givzey
- Compliance: Telescope includes MedTrainer

Say "we've worked with" or "I work closely with Chris Gaertner who invested in [X]". Never say "at OpenView."

## School Connections

- Calvin: Claremont McKenna (CMC), Claremont Consortium (Pomona, Harvey Mudd, Scripps, Pitzer), Harvard-Westlake
- If founder attended any → mention in the opener

## Telescope Team

- Mickey Arabelovic — Founder (ex-Sequoia, 8 years)
- Nicole Naidoo — Partner
- Chris Gaertner — Principal (NOT founder). Stanford, ex-OpenView VP.
- Harrison Doyle — Head of Ops (ex-Engine VP Finance, ex-Procore, CMC grad)
- Calvin Koo — Associate (CMC, Harvard-Westlake)
- Claire Owens — Associate
- Bhargav Mallidi — Associate
- James Winter — Head of Marketing
- Erin Cruz — Finance/Compliance
- Emily Spradlin — Office Coordinator
