---
description: Conference connect. Calvin pastes LinkedIn URLs for people he wants to meet at a conference (ITC Vegas by default); each becomes a Superhuman cold-email draft plus a LinkedIn-message draft, or a single SalesNav draft when Apollo has no good email. Trigger with "/conference-connect <urls>" or when Calvin pastes LinkedIn URLs and mentions ITC or meeting at the conference.
---

# Conference Connect

LinkedIn profile in, Superhuman drafts out. **Separate from everything else:** not Round 1/2,
not market outreach (`/marketoutreach`), not the company-list conference sequence
(`/conference-followups`). Nothing is written to Supabase or `followups.json`, nothing is
sent, and there are no follow-up steps. Calvin edits and sends each draft himself.

Config and copy: `conferences/connect-<slug>.json` (default `itc-vegas-2026`). The copy is a
fixed template with two slots, `{first}` and `{company}`. **Do not rewrite it or add
personalization**; Calvin edits in Superhuman.

## Step 1: Enrich (Apollo, one call per URL)

`apollo_people_match` with `linkedin_url` only. Never turn on waterfall or phone reveal.
Surface the Apollo credit spend from the response. Trim each match into `_connect.json` in
the scratchpad:

```json
[{ "linkedin": "<url as pasted>", "full_name": "", "first": "", "title": "",
   "company": "<organization.name>", "org_domain": "<organization.primary_domain>",
   "email": "<email or null>", "email_status": "<email_status>" }]
```

Use the company name as people say it ("Hippo", not "Hippo Enterprises Inc."). If Apollo
returns no match at all, still include the row with what the URL slug tells you and leave
`first`/`company` blank; the script will flag it for Calvin.

Use `apollo_people_bulk_match` (10 per call) for batches; results overflow to files, so trim
them with a node script rather than reading them. Skip Calvin's own profile if pasted.

## Step 1b: Relationship check, then overrides

A cold "for context, we're a VC firm" email is wrong for someone we already know. Before planning:

- Tracker: look up every email and employer domain in `company_domain`. A company with a
  `replied` sequence or inbound `email_event` rows means **hold**.
- Known relationships: a company in live or recent diligence (e.g. Pathwork) means **hold**.
- Set `"hold": "<reason>"` on those rows; the script skips them and the report lists them so Calvin can write personally.
- A verified address on an obvious sister domain (pnptc.com for Plug and Play, allianzlife.com for
  Allianz) gets `"email_ok": "<why>"` so it routes to email. Leave anything unclear
  (e.g. an unrelated `.biz` domain) on SalesNav.
- Clean company names: strip suffixes and parentheticals ("Hedge (YC P26)" to "Hedge").

## Step 2: Plan

```
node scripts/conf_connect.js plan <scratchpad>/_connect.json
```

Routing per person:

| Apollo result | Drafts |
|---|---|
| Verified email, domain matches employer | **2 drafts:** cold email `to` = their email; LinkedIn message with subject `LinkedIn: <Name> \| <url>` |
| No email, unverified, or domain mismatch | **1 draft:** subject `SalesNav: <Name> \| <url>`, body = the cold email for InMail |

It skips anyone already in the log, anyone already in the company-list ITC sequence, and
anyone missing a first name or company. If any row has `problems`, stop and fix before drafting.

## Step 3: Draft in Superhuman, one at a time

`create_or_update_draft`, `type: "new"`, `subject` and `body` exactly as planned. **Sequential,
never parallel** (parallel calls fail). For the `email` draft, `to` is the person's email
only, never Calvin. LinkedIn and SalesNav drafts have no recipient; pass
`to: ["calvin@telescopepartners.com"]` so the API does not guess one. They are notes, not sends.

## Step 4: Record

Write `<scratchpad>/_connect_done.json` as `[{ linkedin, name, company, email, route, draft_ids: [...] }]`
for what was actually drafted, then:

```
node scripts/conf_connect.js record <scratchpad>/_connect_done.json
```

## Step 5: Report

One table: Name, Company, Route (email / salesnav / skipped), reason. Then the Apollo credits
used. Nothing else.
