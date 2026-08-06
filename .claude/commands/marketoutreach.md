---
description: Cold outreach engine for market diligence work. Trigger when the user pastes a LinkedIn URL alongside an anchor company name and value chain context, or says "outreach", "market outreach", "send outreach to", "draft outreach for", "reach out to", or any variation of wanting to contact an industry expert for a diligence conversation. Also trigger when the user says "outreach engine" or "run outreach". The user provides a LinkedIn profile URL, anchor company, value chain role, and optionally a tracker sheet URL. The skill enriches the person via Apollo, drafts a templated cold email as a Superhuman draft, and updates the Google Sheet tracker. Even if the user just pastes a LinkedIn URL with a company name and some context about what market they're researching, use this skill.
---

# Market Outreach Engine

Draft cold outreach emails to industry experts as part of deal diligence market work.

**This email is a fixed template, not a creative writing exercise.** Almost every word is locked.
The only things that change per person are the recipient's company name and, across different
anchor companies, the industry and the workflow being researched. Resist the urge to improve the
copy. If a sentence reads awkwardly, that is Calvin's phrasing and it stays.

**CRITICAL: The anchor company name must NEVER appear in the outreach email.** It is used only as
internal context to pick the industry and workflow language. The email frames the outreach as
general market research, not "we're looking at investing in X."

## Input Format

The user will paste something in one of these formats:

**Structured:**
```
linkedin.com/in/janedoe, Jampack AI, CPG brand operator, https://docs.google.com/spreadsheets/d/abc123/edit
```

**Natural language:**
```
Outreach to linkedin.com/in/janedoe — she runs ops at a CPG brand, relevant to Jampack's O2C workflow. Tracker: [sheet URL]
```

**Batch (multiple people):**
```
Outreach for Jampack diligence, tracker: [sheet URL]
1. linkedin.com/in/janedoe — CPG brand operator
2. linkedin.com/in/johnsmith — distributor
3. linkedin.com/in/sarahj — competitor
```

Parse the following from the user's input:
1. **LinkedIn URL** — the person's LinkedIn profile
2. **Anchor Company** — the company being diligenced. **Never mention this in the email.**
3. **Value Chain Context** — what part of the value chain this person represents
4. **Tracker Sheet URL** (optional) — if not provided, skip the tracker update step

If the anchor company or value chain context is unclear, ask the user to clarify before
proceeding. Do not guess on these. If a locked block for that anchor already exists in the
registry below, the anchor name alone is enough.

## Workflow

### Step 1: Enrich via Apollo

Use `apollo_people_match` with the LinkedIn URL to get first name, last name, work email
(`reveal_personal_emails: false`), current title, and current company.

Apollo charges 1 credit per match. Invoking this command authorizes the enrichment it requires,
so do not stop to ask for a single lookup. For a batch of more than 10, say the credit count and
confirm before running.

If Apollo returns no email, tell the user and ask if they have the email or want to try
`reveal_personal_emails: true`.

If Apollo shows the person has moved companies since their LinkedIn profile was updated, note the
discrepancy to the user and use the current company in the email.

### Step 2: Confirm the industry and workflow

You need two strings before you can write:

- **Industry** — the market being researched, e.g. `CPG`. Goes in the subject line and paragraph 2.
- **Workflow** — what the anchor company automates, e.g. `their O2C workflow`. Goes in paragraphs 1 and 2.

If the anchor already has a locked block in the registry, both strings come from there and no
research is needed. Otherwise fetch the anchor company's website once to establish what workflow
it automates, then write a new locked block and add it to the registry.

Do not research the recipient's company. The template does not use it beyond the name.

### Step 3: Draft the email

**Subject (templated, only the industry changes):**

```
Telescope Partners | Chat on [Industry] Software and AI Tools
```

**Body:**

```
Hi [First Name],

Hope you don't mind the cold note! I was hoping to connect and briefly chat about your experience scaling [Company]'s operations and the software you utilize for that. Are you free for a quick call in the next couple of weeks?

For context, I'm an investor at Telescope Partners (led by ex-Sequoia partner), a VC firm, and I've been researching tech stacks across the [Industry] space. A big part of our approach is getting to know folks like yourself who understand what's important and what pain points still exist in certain markets. For context on what we're researching, we've been looking into tools that help brands like [Company] scale their operations by automating [workflow]. We've seen that much of this work is done manually or across multiple point solutions. We understand that this is one part of the process (we've heard of tools focused on [adjacent tool categories]), and I'd love to learn more about how you view your tech stack as a whole.

I recognize you're busy, but people we've spoken with have gained value from learning about new market solutions and introductions that led to meaningful workflow improvements. LMK if you're open to a quick chat and thanks in advance.
```

**How much varies, paragraph by paragraph:**

| Paragraph | What changes | What is locked |
|---|---|---|
| 1 | `[Company]`, and `scaling [Company]'s operations` if the anchor automates something other than operations | Everything else, including the CTA sentence |
| 2 | `[Industry]` in sentence 1. Sentences 3 to 5 are locked **per anchor**: within one anchor's outreach only `[Company]` changes | Sentence 2 is locked across all anchors |
| 3 | Nothing | The entire paragraph, across every anchor, every recipient |

Paragraph 2 is where a new anchor company gets its one-time authoring pass. Once written, that
text is frozen for every email in that anchor's batch. Do not re-word it per recipient, and do
not personalize it to the recipient's specific situation. Consistency across the batch is the
point: it is how the responses stay comparable.

**Key rules:**
- NEVER mention the anchor company name. The email is framed as general market research.
- Never use double dashes (`--`) or em dashes anywhere. Use commas, periods, or parentheses.
- Do not add a sign-off. Superhuman appends Calvin's signature on send, so a sign-off in the body
  produces two signatures.
- Do not add personalized flattery, traction callouts, or a sentence about the recipient's
  background. The template has no slot for it.
- Use the recipient's company name exactly as Calvin writes it if he has written it, otherwise as
  the company writes it.
- There is no word limit. The template runs roughly 230 words and that is correct.

### Locked paragraph 2 blocks by anchor

When an anchor appears here, use this text verbatim, changing only `[Company]`.

**Jampack AI** (industry: `CPG`, workflow: `their O2C workflow`)

> For context, I'm an investor at Telescope Partners (led by ex-Sequoia partner), a VC firm, and I've been researching tech stacks across the CPG space. A big part of our approach is getting to know folks like yourself who understand what's important and what pain points still exist in certain markets. For context on what we're researching, we've been looking into tools that help brands like [Company] scale their operations by automating their O2C workflow. We've seen that much of this work is done manually or across multiple point solutions. We understand that this is one part of the process (we've heard of tools focused on revenue forecasting, order planning, etc.), and I'd love to learn more about how you view your tech stack as a whole.

Paragraph 1 for Jampack AI: `scaling [Company]'s operations and the software you utilize for that`.

### Step 4: Create Superhuman draft

Use Superhuman `create_or_update_draft`:
- `type: "new"`
- `to`: **only** the recipient's email from Apollo. Never `calvin@telescopepartners.com`.
- `subject`: the templated subject line
- `body`: the email as HTML, `<div>` per line and `<div><br></div>` between paragraphs

Then tell the user: "Draft created in Superhuman for [Name] ([email]). Review and send when ready."

### Step 5: Update tracker sheet (if provided)

1. Extract the Google Sheet file ID from the URL (between `/d/` and `/edit`)
2. Find the Market Outreach table (columns: Company | Person | Role | Status | LinkedIn)
3. Add a row: person's current company, full name, title, "Drafted", LinkedIn URL

If the sheet update fails, print the row data for manual entry and move on. Do not block the
draft on the tracker.

## Output Summary

**Single person:**
```
Outreach drafted for [Name] ([Title] at [Company])
Email: [email] — draft in Superhuman, ready to review
Tracker: Updated / Skipped
Value chain: [their role relative to anchor company]
```

**Batch:**

| # | Name | Company | Role | Email | Draft | Tracker |
|---|------|---------|------|-------|-------|---------|
| 1 | Jane Doe | Acme Corp | VP Ops | jane@acme.com | Created | Updated |

## Important Notes

- **NEVER reveal the anchor company in the email.**
- If the person works at the anchor company itself, flag it and do NOT draft. They are a
  reference call, not market outreach.
- The value chain context decides whether to contact someone at all and which anchor's block
  applies. It no longer changes the copy.
