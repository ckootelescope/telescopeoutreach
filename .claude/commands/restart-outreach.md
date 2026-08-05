---
description: Start a Round 2 (restart) outreach cadence for a company whose first cadence went stale. Trigger with "/restart-outreach <domain>" or "restart outreach for <company>".
---

# Restart Outreach (Round 2)

For companies Calvin already ran a cadence on that went cold. Calvin picks the companies
manually. This command runs the sequence.

Round 2 cadence: **Day 0 / +2 / +5 / +10**. Because the whole sequence lands inside 10 days,
**one research pass at Day 0 serves Emails 1, 2, and 3.** Never re-research inside a round.

| Email | Day | Content |
|---|---|---|
| 1 | 0 | Paras 1 and 3 fixed. Para 2 is a theme-matched insight. |
| 2 | +2 | Personalized, short. Drafted at due time from the cached dossier. |
| 3 | +5 | Personalized, short. Drafted at due time from the cached dossier. |
| 4 | +10 | Fixed template. Written at scheduling time by `restart_cadence.js`. |

Subject for the whole thread: `Telescope Intro (Sequoia Spinout) - Let's Chat?`

This is deliberately different from Round 1's `Telescope <> [Company] Intro`. Do not reuse the
Round 1 subject: `/process-followups` locates the thread to reply into by matching subject, so a
collision would thread Round 2 follow-ups into the dead Round 1 conversation.

---

## Step 1: Preflight (no LLM work, no research yet)

1. Resolve the company to a slug. Read `followups.json` and find entries matching the domain or
   company name.
2. **Abort if any entry for that slug has `status: "replied"`.** The founder already responded;
   restarting is wrong. Tell Calvin and stop.
3. **Abort if any entry for that slug has `round: 2`.** A restart is already scheduled or ran.
   Report its statuses and stop.
4. Pull `founder`, `email`, `domain` from the Round 1 entries. Do not re-enrich; they are known.
5. Collect the **prior insight bodies** for the do-not-repeat list: the Round 1 Email 1 body if
   present, and the Round 1 Email 4 body (its paragraph 2 carried an insight).
6. Confirm the date of the last email sent to this founder. If it is under 60 days ago, say so
   and ask Calvin whether to proceed rather than assuming.

**If there is no Round 1 history in `followups.json`**, do not silently proceed. Either Calvin
picked the wrong command, or the outreach predates the file / a teammate owned it. Check Affinity
for a prior email to the domain, then report which it is:

- **No prior email anywhere** → this is net new. Tell Calvin and offer `/outreach <url>` instead.
  Round 2's opener ("Know I've reached out a couple times") is false for a first contact.
- **Prior email exists but is not in `followups.json`** → proceed, get the founder and email via
  Apollo `apollo_people_match`, and tell Calvin the do-not-repeat list is **empty**, so the
  repetition guard is not protecting him on this one.

---

## Step 2: Research (RUNS IN A SUBAGENT, on Sonnet)

Spawn one subagent with `model: "sonnet"`. One subagent per company, not one per source.
It returns **only** the dossier below. Website marketing copy, founder career history, resume
data, and press quotes must never enter the main writing context.

The subagent:
a) Fetches the company website, including the blog or changelog if there is one
b) Web-searches the company for news in the last 90 days
c) Harmonic `get_companies` by domain for funding, headcount trend, and highlights
d) Reads `investment-themes.md` and matches the company to **one primary theme** (and at most
   one secondary). It returns the theme *number*, not the theme text.

Note: founder LinkedIn post content is not reliably fetchable. Do not spend calls on it. If
Calvin pasted notable posts when curating, use those.

Write the result to `research/<slug>.json`:

```json
{
  "slug": "", "company": "", "fetchedAt": "<ISO>",
  "what_they_do": "2-3 plain sentences. What they do and what workflow they replace. No jargon.",
  "vertical": "the industry or function they sell into",
  "primary_theme": 0,
  "secondary_theme": null,
  "theme_fit_rationale": "1-2 sentences",
  "workflow_artifacts": ["documents, data types, systems or transaction categories this workflow runs on"],
  "recent_signals": [{"date": "", "type": "blog|news|funding|hiring|product", "summary": "one line", "url": ""}],
  "funding": "last round and amount if public, else null",
  "headcount": "current, and trend if known",
  "prior_insights": ["Round 1 bodies, verbatim, for the do-not-repeat check"],
  "round2": {"email1_body_drafted": null, "email1_body_sent": null, "sentDate": null}
}
```

`workflow_artifacts` feeds sentence 2 of Email 1. Only list things verifiable from the website or
public sources: document types, data formats, systems of record, transaction categories. **Never
infer how people in that industry spend their day** — see the artifacts-not-vignettes rule in
Step 3. Return an empty array rather than guessing; the writer generalizes when it is empty.

---

## Step 3: Draft Email 1

Load **only the matched theme's section** from `investment-themes.md`. Never inject all nine
themes into a writing prompt.

### Paragraph 1 (FIXED)

> Hey [First Name] - Know I've reached out a couple times but wanted to see if now is a better time. I lead our vertical AI investing at Telescope, a $275M Series A fund started by a former Sequoia partner. We lead $5-30M Series A investments in a handful of exceptional companies each year.

### Paragraph 2 (VARIABLE - the only creative part)

Three sentences, roughly 70-85 words, in exactly this structure:

1. **State the theme as a personal preference about a class of business.** Plain language, no
   jargon. Calvin's form: *"I'm a big fan of businesses that are able to execute cross-functional
   workflows where customers have traditionally been using a mix of fragmented point solutions."*
   Vary the opener across companies ("I'm a big fan of...", "I've been spending a lot of time
   on...", "I like businesses that...") but keep it about the category.
2. **Ground it in the company's vertical.** Calvin's form: *"Customer ops is a great example
   where people are slowed down by refunds, billing disputes, and complaints."* See the
   artifacts-not-vignettes rule below, which governs how specific this sentence may get.
3. **A hedged structural observation with a contrast.** Calvin's form: *"I think many of these
   point solutions surface recommendations, but buyers are increasingly looking for tools that
   can execute on those recommendations."* Always "I think", always a now/next or
   current/emerging contrast.

**Critical properties of this paragraph:**
- **It never names the company and never describes what they specifically do.** It describes the
  category and lets the founder infer the fit. It is a thesis, not flattery.
- No compliments about the team, the traction, or the product.
- Must not restate any insight in `prior_insights`. Check it before writing.

#### Artifacts, not vignettes (the strongest AI tell to avoid)

Sentence 2 may name **artifacts**: the documents, data types, systems, or transaction categories
a workflow runs on. It may **never** narrate imagined human behavior or invent situational
moments. Calvin's reasoning: he doesn't think in day-in-the-life detail about someone else's
industry, so projecting it is the clearest signal a machine wrote the email.

| Allowed (artifacts, verifiable domain facts) | Banned (projected human vignettes) |
|---|---|
| "refunds, billing disputes, and complaints" | "radio calls, texts from the super, and a walkthrough someone did on Tuesday" |
| "duplicate part numbers, quotes buried in email threads, and drawings that only exist as PDFs" | "a foreman rekeying numbers into a spreadsheet at the end of a shift" |

When there is no artifact-level fact you can state confidently, **generalize instead of
inventing**. Calvin's own correction: not "the *real* status of a job lives in radio calls, texts
from the super, and a walkthrough someone did on Tuesday" but simply *"the status of a job lives
in day to day interactions."* A vaguer true sentence always beats a vivid invented one.

Two more edits Calvin made, which generalize:
- **Prefer measured verbs over absolutes.** "a workflow that legacy software falls short on",
  not "a workflow legacy software could never touch."
- **Cut emphasis-only intensifiers.** "the status of a job", not "the real status of a job."
  But keep a word like "actually" when it carries a genuine contrast: Calvin approved "a more
  accurate picture of what actually happened" because it contrasts the recorded version with the
  real one. Test: if deleting the word loses a comparison, keep it. If it only adds heat, cut it.

### Paragraph 3 (FIXED)

> I'd love to hear how you guys are thinking of the problem - are you free to chat next week? Would love to talk even if you're not raising - LMK your thoughts.

### Rules

- Blank line between paragraphs. No sign-off; Superhuman handles the signature.
- **No em dashes and no `--`.** Use a spaced hyphen, a comma, or a period.
- No AI-sounding phrases: "the fact that", "is especially compelling", "gives you a strong
  foundation", "says a lot about the team", "uniquely positioned".
- No website language, no jargon, no invented conversations or fabricated referrals.

Save the assembled HTML to `round2.email1_body_drafted` in the dossier.

---

## Step 4: Superhuman draft

`create_or_update_draft` with:
- `type: "new"`
- `to: [founder email]` — **only** the founder. Never `calvin@telescopepartners.com`.
- `subject: "Telescope Intro (Sequoia Spinout) - Let's Chat?"`
- `body`: the assembled HTML

Then report to Calvin: the company, founder, matched theme number and name, and the paragraph 2
text inline so he can react without opening Superhuman. Also print the dossier's
`recent_signals` so he can pick a different angle himself.

### Iterating

`/restart-outreach <slug> --redraft "<steering>"` rewrites paragraph 2 from the **cached
dossier**. Never re-research on a redraft. This keeps Calvin's iteration loop to one short call.

---

## Step 5: After Calvin says he sent it

1. Fetch the sent message and store the body he **actually sent** into
   `round2.email1_body_sent` plus `round2.sentDate`. He edits drafts, and Emails 2 and 3 must
   not repeat angles he added by hand.
2. Schedule the cadence:
   ```
   node scripts/restart_cadence.js --slug <slug> --company "<Company>" \
     --founder "<Founder>" --email <email> --domain <domain> --sendDate <YYYY-MM-DD>
   ```
3. Git add, commit, and push `followups.json` and `research/<slug>.json`. **The scheduler reads
   the remote copy — an unpushed change does nothing.**
4. Tell Calvin: "Round 2 scheduled for [Company]. Email 2 [date], Email 3 [date], Email 4 [date]."

No LinkedIn calendar reminder on Round 2; the connection was made in Round 1.

---

## Drafting Emails 2 and 3 (called by `/process-followups` at due time)

An entry with `round: 2` and `needsDraft: true` has no body yet. Load
`research/<slug>.json` and draft from the cache. **Do not re-research** — the dossier is at most
10 days old by Email 3.

Both emails are short. Round 1's follow-ups run 250-310 characters; stay in that range. These
are bumps inside a live thread, not fresh pitches.

**Email 2 (+2), 2-3 sentences.** A brief bump, then one *new* angle on the matched theme that
was not in Email 1 — a specific use case from the theme's use-case list, or a second-order
implication. Close with a light CTA.

**Email 3 (+5), 3-4 sentences.** Lead with a concrete item from `recent_signals` (a new blog
post, launch, hire, or raise), connect it to the theme, then ask directly how they are thinking
about their next raise.

**Do-not-repeat input for both:** `prior_insights`, plus `round2.email1_body_sent`, plus (for
Email 3) the Email 2 body once written. Store each generated body back onto its
`followups.json` entry and clear `needsDraft`, so the body is a permanent record of what went
out.

Same tone rules as Email 1: "I think" hedging, mundane specifics, no em dashes, no flattery,
no jargon.
