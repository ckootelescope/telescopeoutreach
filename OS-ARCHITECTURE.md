# Telescope OS — Architecture

Written 2026-09-23, from Calvin's description of how he actually works.
Companion to `market-outreach/SPEC.md`, which stays authoritative for market copy.

---

## 0. What this system is for

Two numbers Calvin is measured on:

- **company conversations**
- **10 reference calls per week**

Every component below exists to move one of those or to stop something from
silently rotting. Anything that does neither is not built.

---

## 1. The organising principle: one ear, two mouths

The two outreach engines disagree about who presses send, and **that stays**.
Calvin sends founder emails himself because he does not want generated copy
going to a founder unreviewed. Market outreach sends itself because an expert
batch is volume work with frozen copy.

That difference is fine. It was never the real problem.

The real problem is that each engine also grew **its own way of listening** to
the mailbox: `sync_replies.js` matches by company domain across the whole
mailbox, `mo_sync.js` walks one Gmail thread per live contact. Two listeners,
both expensive, both full sweeps, neither on a schedule.

So the unification is on the **listen** side only:

```
                  ┌────────────────────────┐
                  │   THE EAR              │
                  │  one Gmail history     │
                  │  cursor, incremental   │
                  └───────────┬────────────┘
                              │ routes each new message by sender/thread
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌─────────────────────┐        ┌─────────────────────┐
   │ COMPANY (public.*)  │        │ MARKET (market.*)   │
   │ Calvin sends        │        │ robot sends         │
   │ robot reconciles    │        │ robot reconciles    │
   └─────────────────────┘        └─────────────────────┘
```

One ear. Two mouths. The schemas stay separate, the isolation rules in
`market-outreach/SPEC.md` §2 stay exactly as written.

---

## 2. The hard constraint that shapes everything: MCP is session-only

Granola, Notion, Affinity, Harmonic and Superhuman are **MCP tools**. They exist
only inside a Claude session. A `node` script on a cron cannot call them, ever.

A cron script gets: **Gmail API, Google Calendar API, Supabase, Anthropic API.**
That is the whole list.

Therefore there are **two heartbeats**, not one, and which work goes where is
decided by this constraint rather than by preference.

### The Robot — GitHub Actions, node, every 15 minutes

Deterministic work with no judgement. Cheap, idempotent, safe to run often.

| Job | Cadence | Does |
|---|---|---|
| `ear` | 30 min | Incremental Gmail history pull, route to both engines |
| `send` | 15 min | Market outreach stateless tick |
| `queue` | 15 min | Execute queued dashboard intents (drafts, logs) |
| `health` | daily 07:30 PT | Pulse check, shout if anything is stale |

### The Analyst — scheduled Claude Code cloud routine, twice daily

Judgement and MCP work. Expensive, needs reasoning, runs rarely.

| Job | Cadence | Does |
|---|---|---|
| `briefs` | 06:00 + 13:00 PT | Pre-call context for the next 48h of calls |
| `investors` | Mondays 07:00 PT | Stale-touch pings, new investor suggestions from current markets |
| `corpus` | nightly | Ingest new Granola/Fathom calls into `company_call` |

Naming them separately matters. When something breaks, the first question is
always "was that the robot or the analyst," and they fail in different ways.

---

## 3. Foundation

### 3.1 `job_run` — the thing that was missing

Every automated run writes one row. Nothing else in this document works
reliably without it, because today two Windows tasks failed daily for two
months and nobody knew.

```sql
create table job_run (
  id          bigserial primary key,
  job         text not null,          -- 'ear' | 'send' | 'queue' | 'briefs' | ...
  runner      text not null,          -- 'robot' | 'analyst'
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null,          -- 'ok' | 'failed' | 'skipped' | 'throttled'
  counts      jsonb,                  -- {sent:4, replies:2, bounced:0}
  error       text
);
create index on job_run (job, started_at desc);
```

### 3.2 Health pulse

Daily, the robot checks and shouts on any of:

- a job has not succeeded within 2× its cadence
- a Superhuman draft has sat unsent for 48h (there are **24** today)
- `os_task` has no write in 7 days (true right now, stale since Sep 16)
- a Google token is expired or missing a scope (Calendar is 403 today)
- market steps overdue by more than 2 days (**169** today)
- Gmail quota gate tripped more than twice in 24h

Delivery: Slack DM. Silence means healthy; a message means act.

### 3.3 Scheduling, done properly

GitHub Actions, not Windows Task Scheduler. The two local tasks failed because
one pointed at a file deleted in July and the other had an **unquoted path** that
Windows split at the space in "Calvin Koo". Both also had
`StartWhenAvailable=False` and `DisallowStartIfOnBatteries=True`, so even when
fixed they skip silently on a closed laptop.

Actions runs regardless of the laptop, records every run, and retries.

**But not on GitHub's cron.** Added 2026-09-24, after the first morning live: GitHub's
scheduler is best-effort. It started every July run in this repo 51 minutes to 2h39m
late and delivered none of the morning's 15-minute slots. So the cron only restarts a
dead chain. One run holds a shift (`scripts/shift.js`): it ticks on the wall clock for
about 5h40m, then dispatches its successor through `workflow_dispatch`, which GitHub
explicitly lets the built-in token trigger. The concurrency group allows one running
shift and one pending run, so restart crons can't multiply chains. Weekdays 6am-8pm
Pacific; overnight the chain rests. It costs nothing because the repo is public.

---

## 4. The Ear — incremental reconcile

Replaces the expensive half of `sync_replies.js` and `mo_sync.js`.

```sql
create table mail_cursor (
  id          int primary key default 1,
  history_id  text not null,
  updated_at  timestamptz not null default now()
);
```

Each run: `users.history.list(startHistoryId)` → only what changed since last
time → fetch metadata for those message ids only → route each to the engine
that owns the sender address or thread id → classify (reply / bounce / OOO /
bulk) → write.

- Today: ~200 API calls per sweep, scaling with contact count.
- After: ~3 to 5 calls, scaling with new mail.

Full sweep survives as a fallback for first run, and for when Gmail expires the
cursor (returns 404 on a `historyId` older than ~a week).

**This is what makes 30-minute reconciliation affordable**, and 30-minute
reconciliation is the thing Calvin actually asked for: never having to say
"check my inbox" again.

Classification fixes already landed 2026-09-23: a DSN carrying
`Auto-Submitted: auto-generated (failure)` is a bounce, not an out-of-office.

---

## 5. Company outreach — unchanged model, automated seam

**Calvin still presses send. Nothing about that changes.** Cadence stays Day
0/+2/+7/+12. Copy rules stay.

What changes is that the seam closes itself:

| Was | Becomes |
|---|---|
| Calvin says "I sent it," Claude runs `mark_sent.js` | Ear notices the sent message within 30 min, reconciles |
| Calvin says "check for replies" | Ear notices, stops the cadence, records the reply |
| Draft sits unsent forever | Health pulse names it after 48h |
| Orphan send never becomes a sequence | Ear detects an outbound to an unknown founder, opens a `dash_work_queue` item |

`mark_sent.js`, `sync_replies.js`, `os_orphan_check.js` and
`reconcile_direct_sends.js` stop being things Calvin invokes. Their logic moves
behind the ear; the commands stay for manual repair.

Drafting stays exactly as it is: `/outreach <url>` in a session, research
subagent, Superhuman draft, Calvin reviews and sends.

---

## 6. Market outreach — fully automated, plus LinkedIn

### 6.1 Intake

One command, then nothing to think about:

```
/marketoutreach <anchor company>
  <linkedin url>  — angle, company
  <linkedin url>  — angle, company
```

Apollo enrichment, quality gate, staging and CSV as today. The batch confirmation
stays, because that is the last point a bad angle is cheap to fix.

### 6.2 Sending becomes stateless

Today `mo_send` is one process that sleeps 4 to 7 minutes between sends for up
to five hours. Any interruption kills it — which is exactly what happened on
Sep 23, and a transient 429 got written onto six steps as a permanent `failed`.

Replace with: spacing lives in the database as `step.send_after`. Each 15-minute
tick claims whatever is due now, sends it, stamps the next `send_after`, and
exits in seconds. A crash costs nothing. A throttle aborts the tick and leaves
every step `planned`.

Rule: **only a permanent error marks a step failed.** 429, 403-quota, 5xx and
timeouts are transient and never consume the queue.

### 6.3 LinkedIn — the one genuinely unsolved piece

Calvin wants the same message delivered by LinkedIn as well as email, and wants
LinkedIn to cover anyone whose email Apollo could not verify. Today **12 of 25**
InStockRx contacts are email-less, so this is not a nice-to-have, it is nearly
half the batch.

LinkedIn publishes **no API** for InMail or member messaging. Sales Navigator
has none either. There are exactly three honest options:

| Option | What it is | Cost |
|---|---|---|
| **A. One-click manual** | What exists now, made fast. Robot creates the draft with the profile URL as subject; dashboard shows a queue with copy button and "mark sent". | ~5 sec/person, Calvin in the loop, zero account risk |
| **B. Third-party LinkedIn API** | Unipile, HeyReach or similar. Real API, genuinely automates it. | Subscription, and it drives Calvin's own LinkedIn account — against LinkedIn's ToS, with account restriction as the real downside risk |
| **C. Browser automation** | Playwright against linkedin.com | Highest ban risk, most fragile. `market-outreach/SPEC.md` §1 already ruled this out |

**Recommendation: A now, B only as a deliberate decision.** A LinkedIn
restriction on Calvin's personal account would cost far more than the time it
saves, and his account is the sourcing asset. If B is chosen, run it on a low
daily volume with a warm-up ramp.

Under A the copy is already identical to the email, because `mo_nudge` renders
the same step-1 body. The missing half is the *queue*: a dashboard view listing
who needs a LinkedIn touch, with the text ready to copy and a button that
records it. That turns 12 forgotten CSV rows into a five-minute task.

---

## 7. `action_queue` — how dashboard buttons do real work

The web app has Supabase and the Anthropic API. It does **not** have Gmail send
or MCP. Rather than spreading mailbox credentials into the browser tier, buttons
write an intent and the robot executes it on the next tick.

```sql
create table action_queue (
  id          bigserial primary key,
  kind        text not null,      -- 'draft_investor_email' | 'log_touch' | 'draft_linkedin' | ...
  payload     jsonb not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  status      text not null default 'queued',   -- queued|done|failed
  result      jsonb,
  error       text
);
```

Click "draft an email to this investor" → row lands in `action_queue` → next
tick composes it and creates a **Gmail draft**, which appears in Superhuman
because Superhuman is a Gmail client → Calvin reviews and sends.

Pure database writes (toggle a task, log a text message, change a status) stay
as direct server actions, as they already are. Only mailbox-touching work
queues.

---

## 8. The home page — the week, with context

Keeps the current weekly view: three priorities, today's calls. Adds a
pre-computed brief on every call.

```sql
create table call_brief (
  id            bigserial primary key,
  calendar_ref  text not null unique,     -- os_calendar_event.external_id
  kind          text not null,            -- 'company'|'reference'|'investor'|'internal'
  subject       text,                     -- company / expert / firm name
  one_liner     text,                     -- what they do, plain language
  questions     jsonb,                    -- exactly 3
  sources       jsonb,                    -- what it was built from, for trust
  generated_at  timestamptz not null default now(),
  stale         boolean not null default false
);
```

Generated by **the Analyst**, not on page load — building a brief takes MCP
calls and reasoning, and a home page must render instantly.

Source routing by call kind:

- **Company call** → company website, Harmonic, Affinity history, prior research
  in `research/<slug>.json`. Output: what they do + 3 anchor questions.
- **Reference call** → Granola *Expert Calls* folder for the market, plus the
  live Gmail thread where Calvin, Chris and Mickey trade findings (the Pathwork
  customer-call thread is the model). Output: 3 questions that build on what the
  last calls already established rather than repeating them.
- **Investor** → Notion investor notes, Granola investor calls, `os_investor`
  history, and what Calvin has been working on since they last spoke.

`sources` is stored and shown. A brief whose provenance is invisible does not
get trusted, and an untrusted brief gets ignored.

---

## 9. Investors — a living database

Three jobs, all currently manual.

**Stale touch.** Already partly exists via `os_investor_target.last_outreach`.
Gains two buttons: *draft an email* (queues to `action_queue`) and *log a touch*
with a channel field, because Calvin texts and the mailbox cannot see that.

**Fill the database.** One-time ingest plus ongoing: Notion investor notes and
Granola investor call notes become `os_investor` rows with real content, not
just a name and a date.

**Suggest new investors from actual work.** The valuable one, and the reason
American Family Ventures was missed.

Derive "markets Calvin is actually in" from live signals rather than a guess:

- open `market.project.industry` (Pathwork → life insurance, InStockRx →
  pharmacy supply chain)
- sector mix of company sequences opened in the last 60 days
- `market_sector` weight in the market map

Match against investors tagged by sector focus. Surface as:

> You have spent 3 weeks in life insurance. 6 investors are active there and you
> have not spoken to 4 of them. [Draft intro] [Log a touch] [Not relevant]

"Not relevant" is load-bearing. Without a dismiss action the list becomes noise
within a fortnight and stops being read.

---

## 10. Company call corpus + ask-anything

Calvin wants to ask, mid-investor-conversation:

> "What seed companies have I spoken with, and what can I flag to this investor?"

Free text cannot answer that. It needs structure captured at ingest:

```sql
create table company_call (
  id            bigserial primary key,
  company_id    bigint references company(id),
  company_name  text not null,
  happened_on   date not null,
  source        text not null,          -- 'granola'|'fathom'|'affinity'
  source_ref    text unique,
  stage         text,                   -- seed|series_a|...
  sector        text,
  summary       text,
  highlights    jsonb,                  -- what would interest an investor
  concerns      jsonb
);
```

The Analyst ingests nightly, extracting `stage`, `sector`, `highlights` and
`concerns` as structured fields. The existing `api/week/chat` pattern — bounded
tools, no raw SQL from the model — extends to query it. That endpoint's design
comment is right and should be followed exactly: the model gets a fixed read
bundle and a closed tool set, never a database connection.

---

## 11. Analytics — three changes

Keep everything else.

- **Remove** "does the database still match the mailbox." Once the ear runs
  every 30 minutes the answer is always yes, and a panel that always says yes
  trains people to stop reading panels.
- **Add "pushed me off."** Companies that replied but deferred a call. Today
  they are indistinguishable from a warm reply and quietly disappear. Needs a
  reply-intent classification at ear time: `interested` / `deferred` /
  `passed` / `referred`.
- **Add "sequences dying this week."** Toggleable. Sequences reaching step 4
  with no reply, so Monday has a clear answer to: which do I elevate to Chris,
  which do I stay on.

---

## 12. Pipeline and Market Map

**Pipeline** replaces Hard to Crack when Calvin has defined it. Until then the
existing tab stays; `os_hard_to_crack` keeps its 36 rows and the Affinity sync.

**Market Map** unchanged. 166 sectors, 172 companies. It gains value as the
market-outreach projects accumulate, and it already feeds the investor
suggestions above, which is reason enough to leave it alone.

---

## 13. Build order

Each phase is useful on its own and safe to stop after.

**Phase 0 — stop the bleeding.** *~30 minutes.*
Fix or replace the two Windows tasks. Reset the 6 falsely-failed steps. Mail
moves tomorrow morning. No architecture committed.

**Phase 1 — the heartbeat.** *The foundation; nothing else is reliable first.*
GitHub Actions tick. `job_run`. Health pulse to Slack. Incremental ear. Stateless
market sends with correct throttle handling.
*Delivers:* market outreach fires by itself; company tracker updates itself;
failures become visible. This is the single highest-value phase.

**Phase 2 — close the loops.**
`action_queue`. LinkedIn touch queue. Reply-intent classification. Analytics
changes.
*Delivers:* the 12 email-less experts stop being lost; "pushed me off" and
"dying this week" appear.

**Phase 3 — the OS front door.**
`call_brief` + the Analyst routine. Home page with call context.
*Delivers:* open the laptop, see the day and walk into every call prepared.

**Phase 4 — the memory.**
`company_call` corpus, investor ingest from Notion and Granola, investor
suggestions, ask-anything.
*Delivers:* the investor conversation tool, and suggestions grounded in real work.

---

## 14. Things that will break, named in advance

- **Gmail quota.** The ear makes it far cheaper, but the global gate in
  `gmail_req.js` must arm on 429 as well as 403-quota, and must honour the
  `Retry after` timestamp in the body. It does not today.
- **Google token scope.** Calendar has been 403 since at least Sep 18 and
  nothing noticed. The health pulse fixes the noticing; `reauth_google.js`
  fixes the scope.
- **The Analyst is an LLM.** Briefs will occasionally be wrong. Storing and
  displaying `sources` is what keeps that honest.
- **LinkedIn.** No safe automated path exists. Do not let this quietly become
  browser automation.
- **Two writers, one `followups.json`.** A scheduled run and a manual run can
  still collide. Once the robot owns the schedule, manual runs should be the
  exception rather than the norm.
