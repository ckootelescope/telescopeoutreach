---
description: Diligence market outreach engine. Trigger when Calvin pastes LinkedIn or Sales Nav URLs alongside a target company and an expert angle, or says "market outreach", "outreach to this expert", "run outreach for <company> diligence", or pastes a batch of expert profiles for a live deal. Enriches each person via Apollo, applies the email quality gate, writes a batch CSV, and stages an auto-sending 4-step sequence. Separate from company/founder outreach, which is /outreach and /restart-outreach.
---

# Diligence Market Outreach

Cold outreach to industry experts during a live diligence process, to replace
paid expert-network calls. Customers, competitors, former operators, advisors.

**This is not company outreach.** Company outreach lives in `public.*` and is run
by `/outreach`, `/restart-outreach` and `/process-followups`. This system lives in
the `market.*` schema and shares nothing with it except one read-only guard.
Never mix them.

Full design: `market-outreach/SPEC.md`. Read it before changing anything here.

## The one rule that matters most

**The anchor company is never named in any email.** It selects the industry and
workflow language and nothing else. The email is framed as general market
research, not "we are looking at investing in X." Three separate guards enforce
this (`mo_project.js` on authoring, `mo_render.guard` before every send), and
they are not decoration.

## Inputs

Per expert: a **LinkedIn or Sales Nav URL**, the **target company**, and the
**expert angle** (`customer`, `competitor`, `former`, `advisor`, `other`).

Batch form is normal:

```
Pathwork diligence
1. linkedin.com/in/joanne — customer, John Hancock
2. linkedin.com/sales/lead/abc — customer, Guardian Life
```

If the angle or target is unclear, ask. Do not guess: the angle picks the copy.

## Workflow

### Step 1: make sure the project exists

```
node scripts/mo_project.js --list
node scripts/mo_project.js --show pathwork
```

If the project is new, or the angle has no copy block yet, **Calvin supplies the
copy**. Do not author it yourself. Ask him for paragraph 1 sentence 2 and
paragraph 2 for that angle, put them in `market-outreach/<slug>/project.json`,
and run:

```
node scripts/mo_project.js market-outreach/<slug>/project.json          # report
node scripts/mo_project.js market-outreach/<slug>/project.json --apply
```

Angle matters structurally, not cosmetically. For a competitor, paragraph 2's
"tools that help brands like [Company]" is wrong, because the competitor **is**
the tool. A missing block blocks staging rather than silently falling back.

`fu3_insight_html` is the step-4 insight, authored once per project. Without it
step 4 stages with a null body and `mo_send` refuses to send it.

### Step 2: enrich via Apollo (this is your job, not the script's)

There is no Apollo API key in `.env`, so the scripts cannot call it. Run
`apollo_people_match` per LinkedIn URL yourself, `reveal_personal_emails: false`.
Credits are authorized by invoking this command: do not stop to ask.

Write the raw results to `market-outreach/<slug>/<date>-input.json`:

```json
{ "project": "pathwork",
  "contacts": [
    { "linkedin_url": "...", "angle": "customer", "company_name": "John Hancock",
      "apollo": { "first_name": "...", "last_name": "...", "title": "...",
                  "email": "...", "email_status": "verified",
                  "organization_name": "...", "organization_domain": "...", "id": "..." } }
  ] }
```

`company_name` is the optional `[Company]` override. Use it for the styling
rules: carriers take the parent, not the venture arm ("MassMutual", not
"MassMutual Ventures"); distributors take the distributor ("Integrity", not
"Integrity Marketing Group"). If the current employer sits outside the frame (a
consulting shop, a PE firm), ask Calvin which company to use rather than
defaulting to the current one.

If Apollo shows the person changed jobs since their profile was updated, say so
and use the current company.

### Step 3: gate, CSV, stage

```
node scripts/mo_enrich.js market-outreach/<slug>/<date>-input.json            # report
node scripts/mo_enrich.js market-outreach/<slug>/<date>-input.json --apply
```

The gate auto-emails only when **all three** hold: Apollo says `verified`, the
email domain matches the current employer, and it is not a role address.
Everything else is routed to SalesNav, **never dropped**. The report prints who
will be emailed, who is manual, and a full preview of step 1.

Writes `market-outreach/<slug>/<date>-batch.csv` with
`Name, Title, Company, Angle, LinkedIn URL, Method of Contact, Previously Contacted`.

Nothing sends at this stage.

### Step 4: show Calvin the batch, then send

Show him the table. **One confirmation for the batch**, then:

```
node scripts/mo_send.js --project=<slug>            # report, previews the copy
node scripts/mo_send.js --project=<slug> --apply    # sends
```

Sends go through the Gmail API, not Superhuman, because the daily job runs
unattended. Consequences worth remembering: the signature is appended by
`mo_send` rather than by Superhuman, and follow-ups thread on step 1 using an
RFC Message-ID the script generates and stores.

Throttle: 25/day globally across all projects, 8 to 12 minutes apart. Overflow
rolls to the next day. `--cap=N` to override.

**A step-1 send also creates the LinkedIn nudge draft** in Calvin's own inbox:
subject is the profile URL, body is the exact email that just went out. He clicks
through and pastes the InMail.

### Step 5: the daily job

```
node scripts/mo_sync.js --apply     # replies, bookings, bounces, out-of-office
node scripts/mo_send.js --apply     # whatever is due
```

Reply, booking or bounce stops the contact and a database trigger cancels every
remaining step. Out-of-office **holds** rather than stops, pushing remaining
steps out five days once.

Matching is by thread or **exact** sender address, never by domain. A dozen
experts at one carrier share a domain, and domain matching would stop all of them
when one replied.

### Status

```
node scripts/mo_status.js             # all projects
node scripts/mo_status.js pathwork    # contact by contact
```

## Copy rules

Locked and not up for improvement:

- Paragraph 3 of step 1, and step 3, are identical for every project and angle.
- No em dashes or `--` anywhere. The guard blocks a send over this.
- No sign-off in the body. `mo_send` appends the signature.
- No flattery, traction callouts, or personalization beyond the defined slots.
- `to` is the recipient only, never `calvin@telescopepartners.com`.
- If the person works **at the anchor company**, do not draft. That is a
  reference call, not market outreach.

## Guardrails

- A frozen copy block is never silently rewritten. `--refreeze` replaces one, and
  it affects future sends only.
- `mo_sync` refuses to write on an incomplete Gmail sweep. A throttled sweep that
  found nothing looks exactly like a clean one.
- Market outreach never writes to `public.email_event`. That would corrupt the
  company reply-rate and dashboard numbers.
- The same expert may be contacted again on a later project. Prior contact is
  surfaced on the CSV, not blocked.
