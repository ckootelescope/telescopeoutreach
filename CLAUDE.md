# Telescope Outreach System

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
```

**The subagent MUST NOT return:** founder's career history, prior companies, prior exits, education (unless shared school with Calvin), LinkedIn summary, job titles at previous companies, quotes from press, website copy, technical product descriptions.

### Step 2: Draft Email

The email has three blocks. Lead with the CTA and who Telescope is in the first 3-4 lines. Then the insight. Then the close.

#### Block 1: Opener + CTA + Telescope Intro (SEMI-FIXED)

Personalized greeting, CTA to chat, and Telescope intro all upfront in the first paragraph.

> Hey [First Name] - I love what you're building at [Company] and wanted to see if you're free to chat next week? We're a Series A fund led by Mickey Arabelovic (former Sequoia partner) focused on B2B software and AI. We're on our third fund ($275M) and lead $5-30M rounds in a handful of founders each year.

The greeting can be personalized. If someone on the team has SPOKEN to the company, reference that prior conversation. The Telescope intro is always included. The CTA ("free to chat next week?") should always be in the first sentence or two.

#### Block 2: Insight (VARIABLE — the creative part)

A personalized thematic lead-in + 2-3 sentences with a thesis-level insight about the company.

**Lead-in examples (vary per company, be creative):**
- "We're thematic investors and [space] is one we've been spending a ton of time in."
- "I've been spending a lot of time in [industry] and [Company] keeps coming up."
- "I like your approach to [specific thing]."

**Then the insight itself.** This is NOT a description of what the company does or a restatement of their website. This IS a developed perspective on where the company's vision could go, a structural insight about the problem, or a thesis about why this approach could become something bigger.

**Example (FlowGen):** "We're thematic investors and have been spending a ton of time finding companies who are building for the enterprise. I read your latest blog post on the website and was impressed with the idea of treating the model as untrusted and making incorrect actions structurally impossible. It feels like a critical architecture for moving agents from recommendations to safe execution and one that speaks to the quality of the team behind it."

The insight should show you've thought deeply about the problem. Think: what's the natural evolution? What's structurally interesting? What's the unlock the founder is probably thinking about?

#### Block 3: Close (SEMI-FIXED)

> I'd love to chat even if you aren't raising immediately and see how we can help out. LMK your thoughts!

Can reference timing ("know you just raised, but would be good to see if there could be a fit ahead of the next round") or other context.

#### Rules

- Blank line between each block
- NO sign-off (Superhuman signature handles it)
- NO em dashes (-- or —). Use commas or periods.
- NO jargon or website language
- NO AI-sounding phrases ("the fact that...", "is especially compelling", "gives you a strong foundation", "says a lot about the team")
- Subject line: "Telescope <> [Company] Intro" (or reference a trigger like "congrats on the raise | Telescope intro")

### Step 3: Send to Superhuman Drafts

Use Superhuman MCP create_or_update_draft:
- type: "new"
- to: [founder's email]
- subject: subject line
- body: email as HTML (div tags, br for line breaks)

**CRITICAL: Every Superhuman draft MUST have `to` set to ONLY the founder's email. Never include calvin@telescopepartners.com in the `to` field.**

Tell Calvin: "Draft created for [Founder] at [Company]. Review in Superhuman and send when ready. LinkedIn: [URL]"

### Step 4: After Calvin Says He Sent It

a) Search Superhuman for the sent thread: `list_threads(from: ["calvin@telescopepartners.com"], to: [founder_email], subject_contains: subject_line)` — extract the Superhuman `thread_id`
b) Also search Gmail: "from:me to:{founder_email} newer_than:7d" — extract Gmail thread ID and message ID
c) Draft Email 2, Email 3, and Email 4 content (follow-up templates below)
d) Calculate dates: Email 2 = send date + 2 days, Email 3 = send date + 7 days, Email 4 = send date + 12 days
e) Add entries to `followups.json` with status "pending", including both `threadId` (Gmail) and `superhumanThreadId` (Superhuman) fields
f) Git add, commit, and push `followups.json` to remote — the scheduler reads from the remote copy
g) Create LinkedIn calendar reminder (Step 5)
h) Tell Calvin: "Follow-ups scheduled. Email 2 on [date], Email 3 on [date], Email 4 on [date]."

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

**Paragraph 2 (variable — new insight + Telescope value-add):**
A separate insight about the company that was NOT in Email 1, plus how specifically Telescope can help. This should connect the company's opportunity to Telescope's pattern of helping companies scale.

Example (Grantd): "I think Grantd is solving a clear pain point for RIAs by helping them deliver scalable equity compensation advice to clients with growing exposure to RSUs and equity grants. Over time, the data and workflow layer could also support a broader enterprise platform for helping employees manage their equity."

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

1. **Manual:** Calvin runs `/process-followups` — processes due entries from `followups.json`, creates Superhuman reply drafts, detects replies/bounces, updates statuses, pushes to GitHub
2. **Scheduled:** A Claude Code routine runs daily (~8am PT) with the same logic

### followups.json entry format

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

When adding new entries, ALWAYS push `followups.json` to remote immediately after.

## Cancel Outreach

Set all pending entries for that slug in `followups.json` to `status: "cancelled"`, then commit and push.

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
