# Telescope Outreach System

## What You Do

When Calvin says "outreach to [URL]" or "reach out to [company]", YOU handle everything end-to-end. Calvin provides ONLY a company URL. You do the rest:

1. Research the company yourself (Harmonic, Apollo, web search)
2. Find the founder and their email yourself
3. Draft a personalized Email 1 yourself
4. Send it to Calvin's Superhuman drafts yourself
5. When Calvin confirms he sent it, search Gmail for the thread ID yourself
6. Draft Email 2 and Email 3 content yourself
7. Push the follow-up workflow files to GitHub yourself

Calvin's only actions: provide a URL, review/send Email 1 from Superhuman, tell you "I sent it."

DO NOT ask Calvin to provide contact details, email bodies, JSON, thread IDs, or any other data. You find and generate ALL of that yourself using the MCP tools and APIs below.

## MCP Servers

Use these to research and execute:
- **Harmonic** — company data, founder info, funding, headcount
- **Apollo.io** — founder email enrichment (use apollo_people_match with first_name, last_name, domain)
- **Affinity** — CRM, check for prior Telescope interactions
- **Superhuman Mail** — create email drafts (create_or_update_draft, type "new", body as HTML)
- **Gmail** — search sent threads to get thread IDs after Calvin sends
- **Google Calendar** — create LinkedIn connection reminders

## Step-by-Step Execution

### Step 1: Research

When Calvin gives you a URL, do ALL of the following yourself:

a) **Web search** the company to understand product, positioning, recent news
b) **Harmonic get_companies** with the website domain. Request field_groups: name_id_description_headcount_website, funding, founders_ceo, highlights, location, contact
c) **Affinity search_companies** with the company name, with_interaction_dates: true
   - If ANY Telescope interaction within 90 days → STOP and tell Calvin: "[Colleague] interacted [X] days ago. Proceed?"
   - If prior history exists (>90 days) → check WHO was contacted at the person level. Only reference prior contact in the email if the SPECIFIC PERSON you're emailing was involved. Never assume.
d) **Apollo apollo_people_match** to get the founder's verified email if Harmonic doesn't have one
e) If multiple founders, default to CEO. If ambiguous, ask Calvin.

### Step 2: Draft Email 1

Write the email yourself following these rules:

**Template:**
```
Hey [First Name],

Hope you're doing well. I'm an Investor at Telescope Partners, a $275M early growth firm focused on B2B software and AI (Engine, Fathom, FundraiseUp). Would you be open to a quick Zoom to get introduced sometime in the next couple weeks?

[1-2 sentences: why their company is interesting, in plain casual language]

[Optional 1 sentence: relevant portfolio connection]

Happy to shed some light on where we spend time and would love to be helpful in any way even if you're not raising. LMK your thoughts.
```

**Rules:**
- NO sign-off. Superhuman signature handles it.
- NO "My name is Calvin" — redundant with signature.
- NO double dashes (em dashes). Use commas or periods.
- NO AI phrases: "the fact that", "is especially compelling", "is a fundamentally better approach"
- YES plain language. Explain like telling a friend. If a toddler can't understand the problem, rewrite it.
- YES casual tone. These founders are Calvin's peers.
- Keep the hook to 1-2 sentences MAX. Short and specific, not a paragraph.

**Subject line (preference order):**
1. Personal connection: "fellow CMC grad | Telescope intro"
2. Short tagline: "building the data layer for GCs | Telescope intro"
3. Fallback: "[Company] + Telescope"

**Check for school connections:**
- Calvin: Claremont McKenna (CMC), Claremont Consortium (Pomona, Harvey Mudd, Scripps, Pitzer), Harvard-Westlake
- Harrison Doyle: CMC
- If founder attended any → lead with it

**Reference ONE relevant portfolio connection when applicable:**
- Construction: Harrison Doyle (Head of Ops) is ex-Procore VP of Finance
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
- Say "we've worked with" or "I work closely with Chris Gaertner who invested in [X]". Never say "at OpenView."

**Telescope facts:** Series A firm, $275M Fund III, $5-25M rounds, 5-6 companies/year. Founded by Mickey Arabelovic (7yrs at Sequoia). Chris Gaertner is Principal (NOT founder), Stanford, ex-OpenView VP.

### Step 3: Send to Superhuman Drafts

Use Superhuman MCP create_or_update_draft:
- type: "new"
- to: [founder's email]
- subject: your creative subject line
- body: the email as HTML (div tags, br for line breaks)

Tell Calvin: "Draft created for [Founder] at [Company]. Review in Superhuman and send when ready."

### Step 4: After Calvin Says He Sent It

When Calvin says "I sent it" or "sent the email" or "emails are sent":

a) **Search Gmail** yourself: query "from:me to:{founder_email} newer_than:7d"
b) Extract the thread ID and message ID from the result
c) **Draft Email 2 and Email 3 content** yourself (see guidelines below)
d) **Calculate the dates**: Email 2 = send date + 2 days, Email 3 = Email 2 date + 5 days
e) **Generate workflow YAML files** using the template at templates/followup_template.yml
f) **Push them to GitHub** via the Contents API using the PAT from .env
g) Tell Calvin: "Follow-ups scheduled. Email 2 on [date], Email 3 on [date]. They'll appear in your Superhuman drafts automatically."

### Step 5: LinkedIn Calendar Reminder

Create a Google Calendar event:
- Title: "LinkedIn Connect: [Founder] - [Company]"
- Description: founder's LinkedIn URL
- Date: day after Email 1 sent (or user-specified)

## Follow-up Email Content Guidelines

YOU write these. Calvin does not.

**Email 2 (+48 hours):**
- Bring NEW value: market insight, data point, strategic question about their business
- Never say "just following up" or "bumping this"
- Shorter than Email 1
- End with "Would love to get 20 minutes if you're open to it."
- No sign-off

**Email 3 (+5 days after Email 2):**
- Portfolio anecdote or buyer-side demand signal
- Shortest of all three
- End with "If now isn't the right time, totally understand. But would love to connect whenever there's a window."
- Never say "last note from me" or "I know inboxes get buried"
- No sign-off

## Pushing to GitHub

Read the PAT from .env file in this repo.

```
PUT https://api.github.com/repos/ckootelescope/telescopeoutreach/contents/.github/workflows/{filename}
Headers:
  Authorization: Bearer {GH_PAT}
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
Body:
  {
    "message": "[outreach] schedule Email {N} for {company}",
    "content": "{base64_encoded_yaml}"
  }
```

If file already exists (GET returns sha), include sha in PUT body.

Files to create per company:
- .github/workflows/followup_{slug}_email2.yml
- .github/workflows/followup_{slug}_email3.yml

slug = company name lowercased, non-alphanumeric → underscore

Cron schedule: {random 10-39} 15 {day} {month} * (15 UTC = 8am PT)

Use templates/followup_template.yml and replace these placeholders:
CRON_SCHEDULE, COMPANY_NAME, COMPANY_NAME_VALUE, FOUNDER_NAME_VALUE, FOUNDER_EMAIL_VALUE, COMPANY_DOMAIN_VALUE, THREAD_ID_VALUE, MESSAGE_ID_VALUE, EMAIL_SUBJECT_VALUE, EMAIL_BODY_VALUE, EMAIL_NUMBER, EMAIL_NUMBER_VALUE, COMPANY_SLUG, WORKFLOW_FILENAME

## Cancel Outreach

When Calvin says "cancel outreach for [company]":
- Delete all followup_{slug}_* files from .github/workflows/ via GitHub API

## Batch Mode

When Calvin provides multiple URLs:
- Process each company through the full flow
- Show progress: "3/10 done — next: [company]"
- Stagger cron times so follow-ups don't all fire at the same minute

## Guardrails

- 90-day Affinity overlap: STOP and ask before proceeding
- Person-level verification: never reference prior contact unless verified at the individual level
- Bounce detection: handled by GitHub Actions workflow automatically
- Reply detection: handled by GitHub Actions workflow automatically
- Auto-reply filtering: GitHub Actions ignores OOO and auto-replies

## What GitHub Actions Does (for reference, you don't run this)

The workflow files you push run automatically on their cron schedule. Each one:
1. Authenticates with Gmail using stored secrets
2. Checks for replies from the company domain (ignoring auto-replies/bounces)
3. If no reply → creates a threaded follow-up draft in Calvin's inbox
4. If reply → cancels remaining follow-ups, deletes workflow files
5. Self-deletes after execution
