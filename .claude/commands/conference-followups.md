---
description: Draft the next conference follow-up (Email 2 or 3) as replies on the live threads. Trigger with "/conference-followups 2" or "/conference-followups 3 itc-vegas-2026".
---

# Conference Follow-ups

Draft the next step of a conference sequence as **reply drafts on the existing threads**.

Conference outreach is a third engine, separate from Round 1 (`/outreach`) and Round 2
(`/restart-outreach`). It does **not** live in Supabase and `v_due` will never show it, so
`/process-followups` cannot pick it up. This command is the only thing that moves it forward.

Usage: `/conference-followups <step>` or `/conference-followups <step> <conference-slug>`.
Step is 2 or 3. Slug defaults to the only conference in `conferences/` with a future or
current run window, and you should say which one you picked.

## Step 1: Load the sequence

```
node scripts/conf_render.js --step=<N>
```

Reads `conferences/<slug>.json`. Every body is pre-written and already passes the guard
(no em dashes, no unfilled slots, no double spaces, no sign-off). **Do not rewrite the copy.**
Email 2 is one fixed paragraph and Email 3 is two, both Calvin's own templates. The only
per-company variation in step 3 is the company name and whether the "have been following you
guys for a while now" clause is true, and the renderer already handles that.

Check the date. `cadence.e<N>` in the JSON is the day this step is meant to go out. If today
is well before it, say so and ask before drafting; if today is after, draft anyway and note
the slip.

## Step 2: Find each thread, and drop anyone who answered

For every contact in the JSON, in one pass:

```
search_threads("to:<email> subject:(ITC) newer_than:14d")
```

Take the thread ID from the Email 1 that actually went out. Then decide:

- **Any message in the thread from the founder's domain** means they replied. **Skip them.**
  Never send a templated bump to someone who wrote back. Collect these and report them as
  "replied, handle by hand".
- **No Email 1 in the mailbox** means Calvin never sent it. Skip, and report it as unsent
  rather than drafting a follow-up to a thread that does not exist.
- An out-of-office auto-reply is **not** a reply. Keep the contact in the batch.

Affinity sees the whole team's mail and Calvin's mailbox does not, so for anything ambiguous
check `get_company_list_entries` / the relationship-intelligence fields rather than guessing.
A `Re:` subject on its own proves nothing: it is usually our own previous follow-up.

## Step 3: Create the reply drafts

For each surviving contact, Superhuman `create_or_update_draft`:

- `type: "reply"`
- `thread_id`: the Email 1 thread ID from step 2
- `to`: **the founder's address only**. The API adds Calvin to `to` on reply drafts. Read the
  response back, and if `to` contains `calvin@telescopepartners.com`, re-issue the call with
  `draft_id` and `thread_id` plus an explicit `to`. This is a known failure, not a maybe.
- `body`: the rendered HTML for that company, verbatim
- no `subject` (replies inherit it), no sign-off (Superhuman appends the signature)

## Step 4: Report

Tell Calvin, in this shape:

> Email `<N>` drafted for `<conference>`: `<n>` reply drafts in Superhuman, due `<date>`.
> Skipped `<n>` who replied: `<names>`.
> Skipped `<n>` whose Email 1 never went out: `<names>`.

Then update `conferences/<slug>.json` with a `sent` record for the step so a re-run does not
double-draft, and commit it. Do not push `followups.json` for this; the conference engine does
not touch it.

## What this command does not do

It does not send. Calvin reviews and sends from Superhuman. It does not write to Supabase,
because a 3-step sequence does not fit `step_no between 1 and 4` with the 4-step trigger, nor
`kind in ('first','restart')`. If conference outreach should start appearing in `dash_weekly`,
that needs a migration first, not a workaround here.
