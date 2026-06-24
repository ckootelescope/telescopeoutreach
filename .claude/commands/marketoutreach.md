---
description: Cold outreach engine for market diligence work. Trigger when the user pastes a LinkedIn URL alongside an anchor company name and value chain context, or says "outreach", "market outreach", "send outreach to", "draft outreach for", "reach out to", or any variation of wanting to contact an industry expert for a diligence conversation. Also trigger when the user says "outreach engine" or "run outreach". The user provides a LinkedIn profile URL, anchor company, value chain role, and optionally a tracker sheet URL. The skill enriches the person via Apollo, drafts a tailored cold email via Gmail, and updates the Google Sheet tracker. Even if the user just pastes a LinkedIn URL with a company name and some context about what market they're researching, use this skill.
---

# Market Outreach Engine

Draft and send tailored cold outreach emails to industry experts as part of deal diligence market work. Each email is personalized based on who the person is and what part of the value chain they sit in relative to the anchor company being diligenced.

**CRITICAL: The anchor company name must NEVER appear in the outreach email. It is used only as internal context to understand the market and personalize the email. The email should frame outreach as general market curiosity in the space, not "we're looking at investing in X."**

## Input Format

The user will paste something in one of these formats:

**Structured:**
```
linkedin.com/in/janedoe, Buildcheck, peer review / code compliance, https://docs.google.com/spreadsheets/d/abc123/edit
```

**Natural language:**
```
Outreach to linkedin.com/in/janedoe — she's a GC at a large construction firm, relevant to Buildcheck's design review workflow. Tracker: [sheet URL]
```

**Batch (multiple people):**
```
Outreach for Buildcheck diligence, tracker: [sheet URL]
1. linkedin.com/in/janedoe — peer review firm exec
2. linkedin.com/in/johnsmith — GC / owner
3. linkedin.com/in/sarahj — competitor (Lighttable)
```

Parse the following from the user's input:
1. **LinkedIn URL** — the person's LinkedIn profile
2. **Anchor Company** — the company being diligenced (e.g., Buildcheck, Wisedocs). **Never mention this in the email.**
3. **Value Chain Context** — what part of the value chain or market this person represents (e.g., "peer review firm", "GC / owner", "competitor", "former employee", "customer")
4. **Tracker Sheet URL** (optional) — Google Sheet URL to log the outreach. If not provided, skip the tracker update step.

If the anchor company or value chain context is unclear, ask the user to clarify before proceeding. Do not guess on these.

## Workflow

### Step 1: Enrich via Apollo

Use `apollo_people_match` with the LinkedIn URL to get:
- First name, last name
- Email address (work email by default, `reveal_personal_emails: false`)
- Current title and company

Apollo charges 1 credit per match. Confirm with the user before enriching:
- Single person: "I'll enrich this person via Apollo (1 credit). Proceed?"
- Batch: "This batch of N contacts will use up to N Apollo credits. Proceed?"

If Apollo returns no email, tell the user and ask if they have the email or want to try `reveal_personal_emails: true` for a personal email.

### Step 2: Research for email personalization

Before drafting, gather just enough context to write a sharp middle paragraph. This should be fast, not exhaustive.

1. **Fetch the anchor company's website** using `WebFetch` to understand what the company does, what market it serves, and the pain points it addresses. If you already know the company from earlier in the conversation, skip this.
2. **One quick search** on how the person's company or role connects to the anchor company's market (e.g., `"[person's company]" [anchor company market]`). Skip if the connection is already obvious from the value chain context the user provided.

Two searches max. The user's value chain context input tells you most of what you need.

### Step 3: Draft the email

Compose a cold outreach email that feels like Calvin wrote it personally. Warm, direct, intellectually curious, never salesy.

**Structure:**

```
Subject: Quick question on [specific market/pain point area]

Hi [First Name],

Hope you're well! Apologies for the cold note, but I was hoping to connect and briefly chat about [their specific experience / expertise area relevant to the diligence].

As context, I'm an investor at a venture capital firm called Telescope Partners and a big part of our approach is speaking with experts like yourself who understand what's important and what pain points still exist in certain markets. This also results in us building a network of smart people who we can be helpful to down the road (through hiring, board/advisor opportunities, etc).

[PERSONALIZED MIDDLE PARAGRAPH]

Do you have a few minutes to chat in the next week or two? I'm not selling anything, just trying to get a bit smarter about [this technology / this market / how this area works].
```

**The middle paragraph is the whole ballgame.** This is what makes each email feel handwritten vs. templated. Guidelines:

- **For customers / potential customers of the anchor company**: Reference the pain point the anchor company solves. Mention the person's industry or company and why you think they'd have perspective on it. Example: "I spend a lot of my time digging into construction technology and code compliance review almost always comes up as a pain point for GCs..."
- **For competitor employees**: Reference the broader market trend, not the competitor directly. You're asking about "the space" not about their employer. Example: "I've been spending time understanding how AI is changing document review in construction..."
- **For market experts / industry analysts**: Reference their expertise area and why their perspective on the market evolution matters.
- **For former employees of the anchor company**: Reference the general problem space and their experience at the company (without revealing you're diligencing that specific company).
- **For partners / adjacent companies**: Reference how their product or service intersects with the market you're studying.

**Key rules:**
- NEVER mention the anchor company name in the email. Frame as general market curiosity.
- Never use double dashes (--) anywhere in the email. Use commas, periods, or parentheses instead.
- The middle paragraph must be unique to this person. No boilerplate.
- Reference something specific that connects them to the market.
- Tone: curious investor, not salesperson. Casual but professional.
- Keep the full email under 200 words.
- Subject line should be specific to the market, not generic like "Quick question."
- If you found the person through a specific channel (mentioned on a website, spoke at an event), reference it naturally.

### Step 4: Create Gmail draft

Use `Gmail:create_draft` to create the email:
- **to**: the person's email from Apollo enrichment
- **subject**: the crafted subject line
- **body**: the email body as plain text

After creating the draft, tell the user: "Draft created in Gmail for [Name] ([email]). Review and send when ready."

### Step 5: Update tracker sheet (if provided)

If the user provided a tracker sheet URL:

1. Extract the Google Sheet file ID from the URL (the string between `/d/` and `/edit`)
2. Use Google Drive / Sheets tools to update the Market Outreach section:
   - Find the Market Outreach table (columns: Company | Person | Role | Status | LinkedIn)
   - Add a new row with: person's current company, full name, title, "Drafted", LinkedIn URL

If the sheet update fails, provide the row data for manual entry and move on. Do not block the email draft on this.

## Output Summary

After completing the workflow, provide a brief summary:

**Single person:**
```
Outreach drafted for [Name] ([Title] at [Company])
Email: [email] — draft in Gmail, ready to review
Tracker: Updated / Skipped
Value chain: [their role relative to anchor company]
```

**Batch:**

| # | Name | Company | Role | Email | Draft | Tracker |
|---|------|---------|------|-------|-------|---------|
| 1 | Jane Doe | Acme Corp | VP Eng | jane@acme.com | Created | Updated |
| 2 | John Smith | Beta Inc | Director | john@beta.com | Created | Updated |

## Important Notes

- **NEVER reveal the anchor company in the email.** The email frames outreach as general market curiosity in the space, not "we're looking at investing in X."
- If the person works at the anchor company itself, flag this to the user and do NOT draft an email. They may be a reference call, not a market outreach.
- If Apollo finds the person but they've moved companies since the LinkedIn profile was last updated, note the discrepancy to the user.
