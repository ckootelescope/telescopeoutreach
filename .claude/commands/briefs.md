---
description: Generate pre-call briefs for the next 48 hours of calls. One-liner plus three questions per call, written from Granola, Gmail, Affinity and Harmonic. Trigger with "/briefs", "prep my calls", or on a schedule.
---

# Call briefs

The Analyst half of the system. See `OS-ARCHITECTURE.md` section 8.

Calvin opens the laptop and sees the day. Every call that matters carries a
one-liner and three questions, so he walks in prepared without having done any
prep. This is the routine that puts them there.

**This cannot be a cron job.** It needs Granola, Affinity and Harmonic, and
those are MCP tools that exist only inside a Claude session. The robot
(`scripts/tick.js`) handles everything deterministic; this handles everything
that needs judgement.

## What to brief

```sql
select * from v_brief_queue;
```

Calls in the next 48 hours that need a brief and do not have one. Internal
meetings, lunches and social events are already excluded, so everything in that
view genuinely needs prep. Do not brief anything outside it.

## Three questions. Not five, not ten.

The output is read on a phone thirty seconds before a call. Three questions that
open the conversation Calvin actually wants beats a document he skims.

A good question is one only someone who did the reading could ask. "How do you
think about go to market?" is not a question, it is a category. `brief_write.js`
enforces exactly three and rejects em dashes, because these should read like
Calvin wrote them.

## Where the context comes from, by call type

### Company call (`category = 'company'`)

The ask: what do they actually do, and what are the three questions worth
anchoring the call on.

1. **Their website.** Read it. Do not trust a database description of what a
   company does. Same rule as `/outreach`.
2. **Harmonic** `get_companies` for stage, headcount, funding, founders.
3. **Affinity** `get_company_info` and `get_notes_for_entity` for whether anyone
   at Telescope has spoken to them and what was said.
4. **`research/<slug>.json`** if a dossier already exists from an outreach round.
   Reuse it rather than re-researching.
5. **The sequence history**: `select * from dash_company_log where company = '...'`
   tells you what we already sent them and whether they replied. A first call
   off a cold sequence and a warm inbound are different conversations.

Anchor the questions on the specific thing they do, never on their metrics.

### Reference call (`category = 'expert'`)

The ask: three questions that build on what the previous calls in this market
already established, rather than repeating them.

1. **Granola, the Expert Calls folder**, queried by *market*, not by the
   expert's name. `mcp__claude_ai_Granola__query_granola_meetings`. What have
   the last few calls in this market already settled? Those questions are spent.
2. **The live Gmail thread.** Calvin, Chris and Mickey trade findings on a
   thread per diligence. Search for the anchor company name in mail; the
   Pathwork customer-call thread is the model. That thread holds the current
   state of the thesis and usually names the open question.
3. **`market-outreach/<slug>/project.json`** for the industry framing and what
   we told this person we wanted to talk about.
4. **`market.contact`** for their angle: customer, competitor, advisor. A
   competitor and a customer get different questions about the same market.

The best reference question is the one the last three calls raised and nobody
has answered yet.

### Investor call (`category = 'investor'`)

The ask: what to tell them, and what to ask.

1. **Granola** for previous calls with this firm. What did they say they were
   looking for? Did they ask for anything Calvin owes them?
2. **Notion** investor notes.
3. **`os_investor` and `os_investor_target`** for the relationship history.
4. **What Calvin has been working on since they last spoke** — open
   `market.project` industries and recently opened sequences. This is the
   substance of the call: a partner wants to hear what you have been seeing.

## Writing the file

```json
[
  {
    "external_id": "<from v_brief_queue>",
    "one_liner": "Plain language. What they do and who buys it. No jargon, no marketing copy.",
    "questions": ["...", "...", "..."],
    "sources": ["harmonic", "granola:Expert Calls/pharmacy", "gmail:thread 19f2a", "affinity"],
    "focus": "optional, one line on what a good outcome looks like",
    "prep_note": "optional, anything else worth knowing walking in"
  }
]
```

`sources` is required and is shown in the UI. A brief whose provenance is
invisible does not get trusted, and an untrusted brief gets ignored. Name the
Granola folder and the Gmail thread specifically enough that Calvin could go
read them.

Then:

```
node scripts/brief_write.js _briefs.json          # report, read it
node scripts/brief_write.js _briefs.json --apply
```

A brief Calvin edited by hand is never overwritten. `--force` overrides that,
and should be rare.

## Rules

- Three questions. The script rejects anything else.
- No em dashes, same as the outreach copy.
- Never invent a fact to fill a gap. A thin brief that says what is known beats
  a confident one that is wrong, and this gets read minutes before a real
  conversation.
- If the research turns up nothing usable, write the one-liner from the website
  and say plainly in `prep_note` that there is no prior context. Do not
  manufacture depth.
- Confidentiality carries over from `market-outreach/SPEC.md`: a reference-call
  question may use what other calls taught us, but must never name or
  characterise another company from private notes.
