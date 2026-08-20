# Process Follow-up Emails

Reconcile what actually happened in the mailbox into Supabase, then create Superhuman drafts
for the steps that are still due. **Supabase is the tracker.** `followups.json` is a mirror
the scheduled routine reads; the scripts keep both in step.

Do not hand-write SQL for any of this. Every script is report-only by default. Run the
report, read it, then re-run with `--apply`.

## Step 1: Reconcile the mailbox first

Order matters. Record what went out and who replied *before* drafting anything, or you will
draft a follow-up to someone who already answered, or re-draft a mail Calvin already sent.

```
node scripts/mark_sent.js                 # report
node scripts/mark_sent.js --apply
node scripts/sync_replies.js              # report
node scripts/sync_replies.js --apply
```

- `mark_sent.js` decides "sent" from the mailbox, not from whether a draft exists, so a step
  Calvin sent by hand reconciles correctly. Read its three groups: **confirmed sent**,
  **still genuinely unsent** (drafts waiting), and **marked sent but never left the mailbox**.
- `sync_replies.js` records inbound mail, marks the sequence `replied`, sets `ended_on`, and
  cancels the remaining planned steps. A reply ends every open step for that company
  regardless of round, which is intended.
- **Out-of-office auto-replies are not replies.** `sync_replies.js` already excludes them.
  If you spot an OOO while reading the mailbox yourself, leave the cadence live and tell
  Calvin; do not cancel it.
- Bounces: a hard bounce means the address is wrong. Set the sequence to `bounced` via
  `cancel_sequence.js <domain> "hard bounce" --apply` and tell Calvin.

Report: "Reconciled: N sent, N replied, N bounced."

## Step 2: Find what is due

```sql
select * from v_due;
```

Columns: `step_id`, `sequence_id`, `company`, `founder`, `email`, `round`, `kind`,
`step_no`, `due_date`, `status`. Feed `step_id` to the query below; `sequence_id` is the
real sequence. Measure today in **Pacific**; the database stores dates at 07:00Z, which is
midnight Pacific.

If `v_due` is empty, say so and stop. Otherwise report "Found N follow-ups due."

For each due step pull what you need to draft:

```sql
select co.name, ct.name founder, ct.email, s.round, s.kind, s.subject,
       st.id step_id, st.step_no, st.thread_id, st.draft_id, st.body_html
  from step st
  join sequence s on s.id = st.sequence_id
  join company co on co.id = s.company_id
  join contact ct on ct.id = s.contact_id
 where st.id = any($1::bigint[]);   -- pass v_due.step_id here
```

## Step 3: Get the body

**Round 1** steps already have `body_html` (fixed templates). Send it exactly as stored.

**Round 2** Emails 2 and 3 are personalized and written at due time. If `body_html` is null:

1. Read `research/<slug>.json`. If the dossier is missing, leave the step alone, tell Calvin,
   and move on. Do **not** research from scratch inside this run.
2. Draft per the "Drafting Emails 2 and 3" section of `.claude/commands/restart-outreach.md`.
   The dossier is at most 10 days old, so do not re-research.
3. Round 2 Email 3 is **3 to 4 sentences, 250-310 characters**: lead with a concrete item
   from `recent_signals`, connect it to the matched theme, then ask directly how they are
   thinking about their next raise.
4. If `recent_signals` is empty or contains `undefined` entries, lead with a concrete product
   or workflow artifact instead, and tell Calvin which companies had no usable signal. Never
   lead with a negative signal such as a headcount decline.
5. Write the generated HTML onto `step.body_html` so it becomes a permanent record.

Tone rules are the same as Email 1 and are non-negotiable: "I think" hedging, mundane
specifics, no em dashes, no flattery, no jargon, and **never a fabricated conversation**
("I was chatting with X and it made me think of you"). Calvin cannot back those up.

## Step 4: Create the Superhuman draft

Use `step.thread_id` directly; no thread lookup is needed. If a step already has a
`draft_id`, that draft is stale. **Discard it first** or Calvin ends up with two drafts on
one thread:

```
discard_draft(draft_id: <step.draft_id>)
```

Then create the reply. **Two calls are required.** On a `type: "reply"` into a thread whose
last message was Calvin's (which is every follow-up thread), Superhuman merges the thread's
participants into whatever `to` you pass, so the create comes back addressed to Calvin *and*
the founder. The update path respects `to` exactly.

```
1. create_or_update_draft(type:"reply", thread_id, to:[founder], body)   -> draft_id; to may include Calvin
2. create_or_update_draft(type:"reply", draft_id, thread_id, to:[founder], body)  -> to is founder only
```

Verify the `to` array in the response of call 2 before recording success. If it still
contains calvin@telescopepartners.com, leave the step `planned` and report an error rather
than leaving a draft that emails Calvin his own follow-up.

- Always use `body`, never `instructions`. The copy must go out exactly as written; do not
  let Superhuman's AI writer rewrite it.
- Never append a signature. Superhuman handles it.
- If no thread is found, fall back to `type:"new"` with subject `Re: <subject>`.

Then record it:

```sql
update step
   set draft_id = $1, drafted_at = now(), status = 'drafted', body_html = $2
 where id = $3;
```

## Step 5: Push

The scripts write `followups.json` as well as Supabase. Commit and push it:

```
git add followups.json
git commit -m "[auto] followup scheduler: N drafted, N replied, N bounced"
git push origin main
```

If the push is rejected, the scheduled run beat you to it. **Do not force.** Fetch, compare
your `followups.json` against `origin/main` semantically (match entries on slug + email
number + send date), keep the superset, commit, push.

## Step 6: Summary

```
=== Follow-up Processing Complete ===
Reconciled: N sent, N replied, N bounced
Drafted:    N
Errors:     N
```

List each entry with its result, and call out anything a human needs to decide: missing
dossiers, companies with no usable recent signal, out-of-office holds, and steps whose drafts
have been waiting unsent for more than a few days.

## Notes

- The old Google Apps Script sheet is **dead** (its exec URL returns "Page Not Found") and is
  superseded by Supabase. Do not log there. The `dash_*` and `an_*` views plus the Vercel
  console replace it.
- Weekly figures are views, not stored rows. A new week needs no rollover; it fills in as the
  week's sends and replies get recorded in Step 1.
- Round 1 runs Day 0/+2/+7/+12. Round 2 runs Day 0/+2/+5/+10 and is created by
  `/restart-outreach`.
- If more than 20 steps are due, work in batches of 20 to avoid MCP rate limits, and report
  progress between batches.
