# Telescope Outreach System

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

The email has four blocks. Three are fixed templates. Only the Insight block varies per company.

#### Block 1: Opener (FIXED)

> Love what you're building at [Company] and wanted to reach out.

**Only exception:** If someone on the team has actually SPOKEN to the company (per affinity_spoken), reference that prior conversation instead.

#### Block 2: Insight (VARIABLE — the only creative part)

2-3 sentences with a developed, thesis-level insight about the company's vision and the problem they're solving.

**This is NOT:**
- A description of what the company does
- A restatement of their website
- An observation about the market being big
- A compliment about the team

**This IS:**
- A developed perspective on where the company's vision could go
- A structural insight about the problem they're solving
- A thesis about why this approach could become something bigger

**Example (Desteia):** "I think cross-border trade is a particularly compelling problem space, and Desteia has the potential to evolve from a system of record into a true system of action. I'm assuming the longer-term vision is to automate more of the coordination, document handling, and exception resolution that still sits across operators, brokers, and fragmented systems today which would be a meaningful shift in workflows."

The insight should show you've thought deeply about the problem. Think: what's the natural evolution? What's structurally interesting? What's the unlock the founder is probably thinking about?

#### Block 3: Telescope Intro (FIXED)

> On us, we're an early growth VC (seed - Series B) led by Mickey Arabelovic (former Sequoia partner) focused on B2B software and AI (Engine, Fathom, FundraiseUp). We're on our third fund ($275M) and lead $5-30M rounds in a handful of founders each year.

#### Block 4: Close (FIXED)

> Would love to chat and learn more about what you're building and how we can help out. Are you free next week?

#### Rules

- Greeting: "Hey [First Name],"
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
