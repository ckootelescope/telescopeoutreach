# Diligence Market Outreach — Specification

Status: **draft for review**. Nothing here is built yet.
Written 2026-09-16.

Outreach to industry experts during a live diligence process, to replace paid
expert-network calls with direct conversations: customers, competitors, former
operators and advisors around a target company.

This is **not** the company outreach engine. See "Isolation" for how the two are
kept apart. The operator-sourcing use case (talking to operators in spaces we
like, partly to hear about new companies) is deliberately out of scope here and
will be specified separately.

---

## 1. Scope

**In:** enrichment, an auto-sent 4-step email sequence per expert, reply/bounce/
booking detection that stops the sequence, a per-batch CSV, and a LinkedIn nudge
draft for the experts we cannot email.

**Out:** browser automation of LinkedIn. LinkedIn's defenses make it expensive
and fragile. We send Calvin a nudge draft instead and he pastes the InMail.

**Non-goal:** any change to company outreach behaviour.

---

## 2. Isolation from company outreach

The two systems share one Supabase database and one Gmail client, and nothing
else. Confusion is prevented structurally, not by convention.

| Boundary | Mechanism |
|---|---|
| Tables | Market tables live in their own Postgres schema `market.*`, not `public`. A query must explicitly reach into `market.` to see any of it |
| Foreign keys | Zero FKs between `market.*` and `public.company/contact/sequence/step` |
| Mail records | Market mail goes to `market.event`. **Nothing market-related is ever written to `public.email_event`** |
| Reporting | `v_due`, `dash_*`, `an_*`, `v_*` all read `public.step`/`public.sequence` and are structurally blind to market data |
| Scheduler mirror | `followups.json` is never read or written by market outreach |
| Runtime | Separate command, separate scripts (`scripts/mo_*.js`), separate daily job |
| Console | Separate page, not a mixed view |

### The one deliberate crossing

`scripts/sync_replies.js` (company) matches inbound mail **by sender domain
across the whole mailbox**. A market expert replying from a domain that also
belongs to a live company sequence would be misread as a founder replying, and
would stop that founder's cadence.

This is not hypothetical. The **competitor** angle targets startups in the same
market we invest in, which is exactly the population company outreach cold-emails.

**Fix:** `sync_replies.js` loads the set of `market.contact.email` values at
start and skips any inbound message from one of them. Read-only, one query, one
direction. Nothing in the market system reads company data.

### Naming

`scripts/market_import.js` already exists and belongs to the **market map**
(sectors and companies). Unrelated. Everything here is prefixed `mo_` so the two
are never confused by someone reading the repo. The command Calvin types stays
`/marketoutreach`.

---

## 3. Data model

```
create schema market;
```

### market.project

One per diligence target. The anchor company is internal context only and
**never appears in any email**.

| Column | Notes |
|---|---|
| `id` | |
| `anchor_company` | "Pathwork". Never rendered into an email |
| `slug` | "pathwork". Used for the CSV folder |
| `industry` | "life insurance". Renders in the subject line and paragraph 2 |
| `workflow` | "moving policies from initial inquiry through underwriting decisions" |
| `fu3_insight_html` | The step-4 insight. Authored once per project, angle-independent |
| `status` | `open` / `closed` |
| `created_at`, `closed_at` | |

### market.copy_block

The **project × angle grid**. This is what makes "frozen per anchor" a real
constraint rather than a note in a markdown file.

| Column | Notes |
|---|---|
| `project_id` | |
| `angle` | `customer` / `competitor` / `former` / `advisor` / `other` |
| `para1_s2` | Paragraph 1, sentence 2 |
| `para2_html` | Frozen paragraph 2, may contain a `[Company]` slot |
| `uses_company_slot` | `false` for research/analyst contacts with no buyer-side company to name |
| | unique (`project_id`, `angle`) |

Authored once on first use of that angle, shown to Calvin, then frozen for every
contact on that project at that angle. Never re-worded per recipient — comparable
responses across a batch are the whole point.

### market.contact

| Column | Notes |
|---|---|
| `project_id` | |
| `full_name`, `first_name` | |
| `title` | |
| `company_name` | Exactly as it should render in `[Company]` |
| `company_domain` | Used by the email quality gate |
| `linkedin_url` | Sales Nav or standard LinkedIn, as Calvin supplied it |
| `angle` | Selects the `copy_block` |
| `email`, `email_status` | From Apollo |
| `method` | `email` or `salesnav`, decided by the gate |
| `status` | see the state machine |
| `apollo_id` | |
| | unique (`project_id`, lower(`email`)) where email is not null |

Deliberately **not** globally unique on email: the same expert may be contacted
for a later project. Prior contact is surfaced, not blocked.

### market.step

| Column | Notes |
|---|---|
| `contact_id` | |
| `step_no` | 1–4 |
| `due_date` | date, Pacific |
| `send_after` | timestamptz, for intra-day spacing |
| `subject`, `body_html` | Rendered at send time and stored, so "what did we actually say" never needs a mailbox dig |
| `status` | `planned` / `sent` / `cancelled` / `skipped` / `failed` |
| `sent_at`, `thread_id`, `message_id` | |
| | unique (`contact_id`, `step_no`) |

### market.event

Observed mail. Append-only, `unique (message_id)` makes the sweep idempotent.

`contact_id`, `project_id`, `direction` (`in`/`out`), `sender_email`,
`peer_email`, `thread_id`, `message_id`, `subject`, `sent_at`, `observed_at`,
`kind` (`outbound` / `reply` / `bounce` / `ooo` / `bulk`).

### market.nudge

The LinkedIn nudge draft. `contact_id`, `draft_id`, `created_at`, `status`
(`queued` / `done`). Recorded for visibility only — never verified or chased.

---

## 4. Content model

Four steps: **Day 0 / 2 / 5 / 7**.

### Step 1 — the cold note

Subject: `Telescope Partners | Chat on [Industry] Software and AI Tools`

Three paragraphs:

1. Cold note, the ask, and the CTA. Sentence 2 comes from `copy_block.para1_s2`.
2. Who we are and what we're researching. From `copy_block.para2_html`, with
   `[Company]` substituted.
3. The close. **Locked across every project, every angle, every recipient.**

> I recognize you're busy, but people we've spoken with have gained value from
> learning about new market solutions and introductions that led to meaningful
> workflow improvements. If there's another person on your team that you think
> would be a better fit - happy to chat with them as well. LMK your thoughts and
> thanks in advance.

### The angle grid

Angle changes how the recipient is positioned relative to the industry and
workflow. It is not cosmetic: for a competitor, paragraph 2's "tools that help
brands like [Company]" is actively wrong, because the competitor *is* the tool.

| Angle | Para 1 sentence 2 | Para 2 framing |
|---|---|---|
| `customer` | "your experience scaling [Company]'s operations and the software you utilize for that" — or, where the anchor is not about scaling operations, "your experience as it relates to the [industry] software stack" | "tools that help [buyer nouns] like [Company] ..." |
| `competitor` | "your experience in the [industry] space and working with startups within this sector" | to author on first use — they are a builder, not a buyer |
| `former` | to author on first use | to author on first use |
| `advisor` | to author on first use | drop "like [Company]" entirely, keep the rest verbatim |

Authored blocks, verbatim, frozen:

**Jampack AI** — industry `CPG`, workflow `their O2C workflow`, angle `customer`

- para1_s2: `your experience scaling [Company]'s operations and the software you utilize for that`
- para2: *"For context, I'm an investor at Telescope Partners (led by ex-Sequoia partner), a VC firm, and I've been researching tech stacks across the CPG space. A big part of our approach is getting to know folks like yourself who understand what's important and what pain points still exist in certain markets. For context on what we're researching, we've been looking into tools that help brands like [Company] scale their operations by automating their O2C workflow. We've seen that much of this work is done manually or across multiple point solutions. We understand that this is one part of the process (we've heard of tools focused on revenue forecasting, order planning, etc.), and I'd love to learn more about how you view your tech stack as a whole."*

**Pathwork** — industry `life insurance`, workflow `moving policies from initial inquiry through underwriting decisions`, angle `customer`

- para1_s2: `your experience as it relates to the life insurance software stack` (no `[Company]` slot)
- para2: *"For context, I'm an investor at Telescope Partners (led by ex-Sequoia partner), a VC firm, and I've been researching tech stacks across the life insurance space. A big part of our approach is getting to know folks like yourself who understand what's important and what pain points still exist in certain markets. For context on what we're researching, we've been looking into tools that help brokers, BGAs and carriers like [Company] speed up how policies move from initial inquiry through underwriting decisions. We've seen that much of this work is done manually or across multiple point solutions. We understand that this is one part of the process (we've heard of tools focused on carrier guide lookups and document review, etc.), and I'd love to learn more about how you view your tech stack as a whole."*

`[Company]` styling rules carried over from the current command: carriers take
the parent name, not the venture arm ("MassMutual", not "MassMutual Ventures");
distributors/BGAs take the distributor ("Integrity", not "Integrity Marketing
Group"); where the current employer sits outside the frame, confirm with Calvin
which company to use rather than defaulting to the current one.

### Step 2 — Day 2

Locked. First name only.

> Hey [First] - wanted to follow up - are you free for a chat next week? Here is my [calendar link](https://calendly.com/calvin-telescopepartners/30min) if helpful - would love to chat!

"calendar link" hyperlinks to `https://calendly.com/calvin-telescopepartners/30min`.

### Step 3 — Day 5

Locked. First name only.

> Hey [First] - following up again. Know that you're likely busy with a lot of other things, but would appreciate the chance to hop on a quick virtual call even if it's just for 15 minutes.
>
> I do think it'll be mutually beneficial as we're open to sharing a lot of the new startups that we've seen in the space building exceptional tools for your guys' workflows. Would be also happy to help out in any other ways to return the favor, but LMK your thoughts!

### Step 4 — Day 7

Two paragraphs. Paragraph 1 carries `project.fu3_insight_html`, authored once per
project. Paragraph 2 is locked.

Reference (Jampack):

> Hey [First] - wanted to try one more time. As we've spent more time in the space, we've come across a number of tools that have automated the full order-to-cash process as well as some downstream trade spend management workflows that we think could be helpful to your guys' operations.
>
> Not trying to sell you on them as we're not investors ourselves, but the purpose is really to understand whether this would be helpful to you or not as we think about the market moving forward. LMK your thoughts - happy to be helpful however we can and would love to speak with you!

### Rules across all steps

- The anchor company is **never named**.
- No em dashes or double dashes.
- No sign-off — Superhuman appends the signature.
- No flattery, traction callouts, or personalization beyond the defined slots.
- `to` is the recipient only, never `calvin@telescopepartners.com`.
- If the person works **at the anchor company**, do not draft. That's a
  reference call, not market outreach.

---

## 5. Enrichment and the email quality gate

`apollo_people_match` on the LinkedIn/Sales Nav URL, `reveal_personal_emails: false`.
Credits are spent without asking.

A contact is auto-emailed only if **all three** pass:

1. Apollo `email_status` is **verified** (not guessed, not unavailable)
2. The email domain **matches the current employer's domain** — catches stale
   addresses at a former employer and personal Gmail
3. Not a role address (`info@`, `contact@`, `hello@`, `sales@`, ...)

Fail any one → `method = salesnav`, no email is sent, and the contact lands on
the CSV for Calvin to work manually. **Nobody is dropped.**

If Apollo shows the person has changed companies since their LinkedIn was last
updated, flag the discrepancy and use the current company.

---

## 6. Batch flow (`/marketoutreach`)

Input per expert: LinkedIn or Sales Nav URL, target company, angle.

1. Resolve or create the `market.project`. If the angle has no `copy_block`,
   author one, show Calvin, freeze on approval.
2. Enrich every expert via Apollo.
3. Apply the quality gate, set `method`.
4. Write the batch CSV.
5. **Show Calvin the table**: who will be emailed, who is routed to SalesNav,
   and who was contacted on a previous project. One confirmation for the batch.
6. On go: stage 4 steps per emailable contact, schedule step 1 into the send
   window, and create the LinkedIn nudge drafts.

### Batch CSV

`market-outreach/<project-slug>/<YYYY-MM-DD>-batch.csv`

`Name, Title, Company, Angle, LinkedIn URL, Method of Contact, Previously Contacted`

---

## 7. Daily job

Runs `mo_sync` then `mo_send`. Independent of the company `/process-followups`
job; neither can see the other's work.

### mo_sync — reconcile

For each live contact, classify inbound mail. **Matching is by `thread_id` of a
step we sent, or by exact From address equal to `contact.email`. Never by
domain.** With twelve experts at one carrier, domain matching would stop all
twelve when one replies.

| Signal | Effect |
|---|---|
| Human reply | **Stop.** `status = replied`, cancel remaining steps |
| Calendar booking with that email | **Stop.** `status = booked`, cancel remaining steps |
| Hard bounce | **Stop.** `status = bounced`, flag to Calvin |
| Out-of-office | **Hold.** Push remaining `due_date`s out once by 5 days. Do not stop |
| Bulk / newsletter (`List-Unsubscribe`, `List-Id`) | Ignore |

Auto-reply and bulk detection reuse the logic already proven in
`sync_replies.js`. Calendar bookings are a first-class stop condition from day
one — in company outreach they were invisible for months, and several founders
who booked a Calendly without replying kept receiving follow-ups.

### mo_send — send what's due

Select steps with `status = planned`, `due_date <= today` (Pacific), whose
contact is still live. Then:

- **Cap 25 sends/day**, global across all projects
- Spaced **8–12 minutes apart, jittered**, inside a ~4-hour window during PT
  business hours
- Overflow rolls to the next day
- Send, then record `thread_id`, `message_id`, `sent_at`, `status = sent` in one
  transaction. Because the system performs the send, there is no equivalent of
  `mark_sent.js` — send and record cannot diverge
- On send failure: `status = failed`, surfaced in the daily summary, never
  silently retried into a double-send

---

## 8. Contact state machine

```
          gate fails
queued ─────────────────► manual        (SalesNav, no email ever sent)
  │
  │ batch approved, step 1 sent
  ▼
active ──► replied        human reply
  │   ├──► booked         calendar event
  │   ├──► bounced        hard bounce
  │   ├──► stopped        manual kill
  │   └──► completed      all 4 steps sent, no response
  │
  └── out-of-office: stays active, remaining steps pushed +5d once
```

A contact leaving `active` cancels every remaining `planned` step. **Cancelling
must also cover any step already rendered or queued for send** — the company
system had this exact bug, where a reply stopped `planned` steps but left an
already-drafted one live and one keystroke from mailing someone who had already
written back.

---

## 9. Scripts

| Script | Purpose |
|---|---|
| `scripts/mo_project.js` | Create/open a project, author and freeze copy blocks |
| `scripts/mo_enrich.js` | Apollo enrichment, quality gate, CSV, stage contacts |
| `scripts/mo_send.js` | Send due steps, throttled and spaced |
| `scripts/mo_sync.js` | Reconcile replies, bounces, bookings, OOO |
| `scripts/mo_status.js` | Per-project status: contacted / replied / booked / bounced |

All report-only by default, `--apply` to write, matching the existing
convention.

---

## 10. Guardrails

- Anchor company never appears in any email.
- Person at the anchor company → refuse to draft.
- `to` is the recipient only, always.
- Never send to a contact whose status is not `active`/`queued`.
- Refuse to write on an incomplete Gmail sweep, as `sync_replies.js` already
  does — a throttled sweep that found nothing looks exactly like a clean one.
- Copy blocks are frozen once approved. Changing one affects future sends only;
  already-sent mail is never retroactively reinterpreted.

---

## 11. Build order

1. Schema + `mo_project` + copy blocks for Jampack and Pathwork `customer`
2. `mo_enrich` + CSV + the quality gate — reviewable without sending anything
3. `mo_send` with throttling, plus the LinkedIn nudge drafts
4. `mo_sync` reconcile and the state machine
5. The `sync_replies.js` exclusion guard
6. `mo_status` and the console page
7. Rewrite `.claude/commands/marketoutreach.md` against this spec

Steps 1–2 are safe to build and inspect before anything can be sent.

---

## 12. Open items

- Competitor, former and advisor copy blocks are authored on first use, not
  invented up front.
- Whether `fu3_insight_html` ever needs to vary by angle. Assumed no for now.
- Whether the 25/day cap is per project or global. Assumed global.
