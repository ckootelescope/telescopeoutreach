---
name: weekly-team-email
description: Generate Calvin's weekly team update email skeleton every Sunday at 8am PT and save it as a Superhuman draft.
---

You are generating Calvin Koo's weekly team update email for Telescope Partners. Calvin is an Associate at Telescope, an early growth VC firm. Every Sunday morning, you produce a skeleton draft of his weekly update email and save it to his Superhuman drafts.

## STEP 1: Gather Data

### 1A: Outreach Metrics from Google Sheet
Use the Google Drive `read_file_content` tool to read the Outreach Tracker spreadsheet:
- File ID: `1Sk9HndYNzXj_tHg8-T4EGqSqkPk1QKXH2UOQt23s7CA`
- Extract: total companies outreached this week, replies received this week.
- Count unique companies with SENT actions in the past 7 days.

### 1B: Company Conversations from Google Calendar
Use the Google Calendar `list_events` tool for the past 7 days (Monday through Sunday):
- calendarId: "calvin@telescopepartners.com"
- timeZone: "America/Los_Angeles"
- pageSize: 100

Identify "Company Conversations" = events with `colorId: "9"` (Blueberry). Exclude internal meetings (e.g., "team meeting"). Count for the "Company conversations" metric.

### 1C: Meeting Summaries (Granola -> Fathom)

For each Company Conversation, gather meeting context:

**Priority 1: Granola** - Use `query_granola_meetings` or `list_meetings`. Granola includes Calvin's private notes which are the richest source.

**Priority 2: Fathom** - If Granola has no notes, fall back to Fathom `list_meetings` + `get_meeting_summary`.

Only include calls where CALVIN was a participant. Only include TRUE FIRST CALLS - if a company has appeared in a prior weekly update email, exclude it from "Company First Call Summaries." Follow-up meetings are not first calls.

## STEP 2: Compose the Email

Use the Superhuman `create_or_update_draft` tool with the `body` parameter (NOT `instructions`) to preserve exact formatting.

### EXACT FORMAT TEMPLATE

This is the EXACT layout. No deviations. No bullet characters anywhere.

```
Weekly Metrics

Company outreach: [number]
Company conversations: [count]
Customer/network outreach: [PLACEHOLDER]
Customer/network conversations: [PLACEHOLDER]

Active Market Dives

[PLACEHOLDER]

Companies Actively Working

[PLACEHOLDER]

Company First Call Summaries

[Company Name]
Product: [one line]
Why Now: [one line]
Metrics: [one line]
Next Steps: [one line]

[Company Name]
Product: [one line]
Why Now: [one line]
Metrics: [one line]
Next Steps: [one line]

```

### HTML ENCODING RULES

- Use `<div>` for each line
- Use `<div><br></div>` for blank lines between sections
- Section headers (Weekly Metrics, Active Market Dives, Companies Actively Working, Company First Call Summaries) should be bold: `<div><b>Weekly Metrics</b></div>`
- Company names on their own line, bold: `<div><b>Platformr</b></div>`
- Category labels (Product/Why Now/Metrics/Next Steps) are NOT bold, NOT indented, NO bullet characters. Just: `<div>Product: text here</div>`
- NO bullet characters (•) ANYWHERE in the email. Not on metrics lines, not on company names, not on sub-categories. Zero bullets.
- NO `&nbsp;` indentation anywhere
- NO Fathom/Granola links on company names
- NO founder names in parentheses after company names
- Do NOT include a sign-off (no "Best, Calvin") - Calvin's email signature handles this automatically

### CONTENT GUIDELINES - CRITICAL

The #1 problem with previous drafts was VERBOSITY. Every line in this email should be ONE line. Not two sentences. Not three. ONE.

Study these real examples from Calvin's sent emails:

**Product** (ONE line, use dashes to connect ideas):
- "Cloud management platform (native AWS) for SMB/mid-market - replaces work traditionally managed by consultants/MSPs with an autonomous solution"
- "Agentic OS for debt management selling to banks, lenders, and debt servicers"
- "AI-led customer research platform combining AI-moderated interviews, synthetic personas/digital twins, and synthetic UX testing agent"
- "Rilla/Siro competitor - AI-enabled sales conversational intelligence for the home services industry"
- "AI scheduling and frontline labor platform - predictive demand + autonomous scheduling for hourly workers"
- "AI 'system of action' for QSR back-of-house - sits on top of POS, R365, and labor systems and provides business recommendations based on data"
- "Back-office automation platform (most clients in real estate) that offers fully autonomous reporting"
- "Essentially an enriched European legal database delivered via search API and MCP"
- "High-mix, low-volume AI-assisted PCBA manufacturing in Austin"

Rules:
- ONE line only
- Use dashes (-) to connect ideas, not periods
- Start with competitor context IF relevant (e.g., "Rilla/Siro competitor -")
- Do NOT list out every feature or module
- Do NOT name specific customers
- Do NOT include technical architecture details (verification loops, knowledge graphs, etc.)

**Why Now** (ONE line):
- "Debt management is still a largely manual process with coordination among various parties - AI agents can now fully own the workflow where previous tools were point-solutions addressing one part of the process"
- "Cloud management for SMBs still requires expensive, complex implementations primarily done by people - Platformr's channel-first approach through MSPs creates a scalable distribution model"
- "No solution on the market yet that offers synthetic personas/digital twins (UserTesting, ListenLabs, etc)"
- "Europe has no single, high-quality legal data source as LexisNexis is not in Europe"
- "Re-industrialization movement and AI offers a lower cost of production at scale"
- "Voice intelligence platforms are becoming a key part of field workflows and top competitors (Rilla, Siro) are currently horizontal platforms without a strong vertical focus"
- "Multi-employment at all-time high and labor management is still a largely unsolved problem"
- "8,000+ US tax jurisdictions create complexity and mid-market companies currently pay $25K-$500K for manual solutions - AI enables a cost-effective automated alternative"

Rules:
- ONE line, 1-2 sentences max
- Use dashes (-) to connect ideas
- Focus on the market gap or structural problem, not founder backstory
- Do NOT editorialize about opportunity size
- Do NOT include technical details about how the product works

**Metrics** (ONE line, numbers only):
- "~$2M ARR, 6x growth over 12 months, targeting Series A in Q1 2027"
- "$100K ARR in 2 months"
- "$2.7M ARR (started year at $1M, targeting $5M EOY), doubling every 4 months"
- "Pre-revenue"
- "Effectively pre-revenue"
- "~$500K ARR"
- "Grew to $1M ARR in 12 months, 122% NRR - raising $5M seed, targeting term sheet by early August"
- "$900K last year -> $2.3M in first 6 months (~5x annualized growth), raising $10-15M Series A"
- "Advisory: ~$500K revenue, 15-20 customers / Software: 2 clients signed, 4 in pipeline, ACV $50K-$1M+"
- "$2M ARR, 25% MoM, 20 customers, 95% retention, ACV $37K-$220K"

Rules:
- ONE line only
- Lead with ARR, then growth rate, then funding status if relevant
- Use commas and dashes to pack numbers together
- Do NOT list specific customer names (no "Apple, JP Morgan, Aon")
- Do NOT list specific investor names in conversations (no "Insight, a16z, Bain, Battery")
- Do NOT include pipeline dollar amounts
- Do NOT include gross margin percentages unless exceptional
- If pre-revenue, just say "Pre-revenue" - do not pad with pipeline details

**Next Steps** (ONE short line):
- "Pass"
- "Too early - stay in touch"
- "Too early - reconnect Q4 2026"
- "Follow up call in two-weeks with CG/CK"
- "Follow up meeting with CEO next week"
- "CG/CK reviewing deck + data"
- "Reconnect in a few months"
- "Check in early August before active raise"
- "Passed due to burn profile + customer concentration"
- "Too small - check in Q4 to get update"

Rules:
- ONE short line, usually 5-15 words
- Be decisive: pass, too early, follow up, reconnect
- If passing, state the reason briefly (3-5 words)
- If continuing, state the specific next action
- Do NOT write multi-sentence explanations
- Do NOT hedge with "tension between X and Y" type language

### VERBOSITY CHECK - RUN THIS BEFORE FINALIZING

Before creating the draft, re-read every line and ask:
1. Is this ONE line or did I write two sentences? If two, cut to one.
2. Did I include detail that Calvin would strip out? (Technical architecture, specific customer names, pipeline amounts, investor names, gross margins, specific deal sizes, ACV ranges) If yes, remove.
3. Does this line match the LENGTH of Calvin's examples above? If mine is 2x longer, cut it.
4. Did I use periods (.) to separate ideas? Switch to dashes (-).
5. Is my Next Steps more than 10 words? Shorten it.

### WHAT TO EXCLUDE

- Companies that appeared in previous weekly updates (follow-ups, not first calls)
- Fathom or Granola links
- Founder names next to company names
- Bullet characters of any kind
- Technical product details (verification loops, knowledge graphs, API architecture)
- Specific customer/pipeline names in Metrics
- Investor names in active conversations
- Multi-sentence explanations in any field
- Any line that reads like meeting notes rather than a concise summary

## STEP 3: Create Superhuman Draft

Use `create_or_update_draft`:
- type: "new"
- to: ["calvin@telescopepartners.com"]
- subject: "Weekly Metrics - [M/D/YYYY] - Calvin" (use the Sunday date)
- body: HTML email body (use `body` param, NOT `instructions`)

## STEP 4: Confirm

Short summary: draft created, metrics pulled, companies listed, any gaps noted.
