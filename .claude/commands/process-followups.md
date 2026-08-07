---
description: Process due follow-up emails via Superhuman. Run daily or on-demand to create follow-up drafts, detect replies/bounces, and update tracking. Trigger with "/process-followups" or "process followups" or "run followups".
---

# Process Follow-up Emails

Read `followups.json`, find all pending entries that are due, check for replies and bounces, create Superhuman drafts for entries that should still go out, update statuses, and push changes.

## Step 1: Read and filter due entries

1. Read `followups.json` from the repo root
2. Get today's date (YYYY-MM-DD)
3. Filter `pending` array for entries where `sendDate <= today` AND `status === "pending"`
4. Report to Calvin: "Found N follow-ups due. Processing..."
5. If none are due, say so and stop

## Step 2: Process each entry

For each due entry, run these checks in order. Stop processing that entry as soon as a check triggers.

### 2a: Check for bounces

Use Gmail MCP `search_threads` with query:
```
from:(mailer-daemon OR postmaster) to:calvin@telescopepartners.com subject:(delivery OR failure OR undeliverable) newer_than:30d
```

Read the returned threads. If any thread snippet or message mentions the founder's email address (the `email` field in the entry), this is a bounce.

If bounced:
- Set `entry.status = "bounced"`
- Set `entry.processedAt` to current ISO timestamp
- Log: "BOUNCED: [company] - [founder] ([email])"
- Skip to next entry

### 2b: Check for replies

Use Superhuman MCP `list_threads` with:
- `from: [entry.email]` (the founder's email)
- `to: ["calvin@telescopepartners.com"]`
- `start_date`: 7 days before the entry's original Email 1 would have been sent (approximate: use entry.sendDate minus 14 days as a safe window)

If any thread is returned where the founder sent a message (not just Calvin's outbound), this is a reply.

Also check: Use Superhuman MCP `list_threads` with:
- `from` filter matching the entry's `domain` (e.g., if domain is "company.com", search for messages from that domain)
- `subject_contains`: the entry's `subject` (strip "Re: " prefix first)

If a reply is found:
- Set `entry.status = "replied"`
- Set `entry.processedAt` to current ISO timestamp
- Log: "REPLIED: [company] - [founder]"
- Also mark ALL other pending entries for the same `slug` as "replied" (cancels the whole cadence)
- Skip to next entry

### 2b-2: Generate the body for Round 2 entries

Entries with `round: 2` and `needsDraft: true` have `body: null` — Emails 2 and 3 of a restart
cadence are personalized and written at due time.

For these entries only:

1. Read `research/<slug>.json`. If it is missing, set `status: "error"`, note the missing
   dossier, and skip the entry — do **not** research from scratch inside this run.
2. Draft the body per the "Drafting Emails 2 and 3" section of
   `.claude/commands/restart-outreach.md`. The dossier is at most 10 days old, so **do not
   re-research**.
3. Write the generated HTML onto `entry.body` and delete `entry.needsDraft`, so the body becomes
   a permanent record of what went out.
4. Continue to 2c as normal.

All other entries (`round` absent or `1`) already have a pre-written body. Leave them untouched.

### 2c: Create Superhuman draft

**Find the Superhuman thread for reply threading:**

Use Superhuman MCP `list_threads` with:
- `to: [entry.email]`
- `from: ["calvin@telescopepartners.com"]`
- `subject_contains`: entry's `subject` with "Re: " stripped

If a thread is found, use its `thread_id` for a reply draft.

**Create the draft:**

If Superhuman thread found:
```
create_or_update_draft:
  type: "reply"
  thread_id: <superhuman_thread_id>
  to: [entry.email]
  body: <entry.body>   (HTML, exact text - do NOT use instructions)
```

If NO Superhuman thread found (fallback):
```
create_or_update_draft:
  type: "new"
  to: [entry.email]
  subject: "Re: <entry.subject>"
  body: <entry.body>   (HTML, exact text - do NOT use instructions)
```

**CRITICAL:** ALWAYS set `to: [entry.email]` with ONLY the founder's email on EVERY draft, including reply drafts. The Superhuman API defaults reply recipients to the thread's last sender, which is Calvin. Omitting `to` will address the draft to Calvin instead of the founder. Never include calvin@telescopepartners.com in the `to` field.

**CRITICAL, and passing `to` on the create call is NOT enough.** On a `type: "reply"` into a thread whose last message was sent by Calvin (which is every follow-up thread, since Calvin sent Email 1/2/3), Superhuman **merges** the thread's participants into whatever `to` you pass. The create call comes back with
`to: [calvin@telescopepartners.com, founder@company.com]` even though you passed only the founder.

The fix is a second call. After creating the reply, immediately call `create_or_update_draft`
again with the **same `draft_id` and `thread_id`**, the same body, and `to: [entry.email]`. The
update path respects `to` exactly and the draft comes back addressed to the founder alone.

```
1. create_or_update_draft(type:"reply", thread_id, to:[founder], body)  -> returns draft_id, to may include Calvin
2. create_or_update_draft(type:"reply", draft_id, thread_id, to:[founder], body)  -> to is now founder only
```

Verify the `to` array in the response of step 2 before marking the entry `completed`. If it still
contains calvin@telescopepartners.com, set `status: "error"` rather than leaving a draft that
would email Calvin a copy of his own follow-up.

**IMPORTANT:** Always use the `body` parameter, NOT `instructions`. The email content is pre-written in followups.json and must be sent exactly as-is. Do NOT let Superhuman's AI writer rewrite it.

**IMPORTANT:** Do NOT append any signature. Superhuman handles signatures automatically.

After draft creation:
- Set `entry.status = "completed"`
- Set `entry.processedAt` to current ISO timestamp
- Log: "DRAFTED: [company] - Email [emailNumber] for [founder]"

### 2d: Handle errors

If any MCP call fails for an entry:
- Set `entry.status = "error"`
- Set `entry.error` to the error message
- Set `entry.processedAt` to current ISO timestamp
- Log the error and continue to the next entry (don't stop the whole batch)

## Step 3: Save and push

1. Write the updated `followups.json` back to disk (preserve formatting: `JSON.stringify(config, null, 2)`)
2. Git add, commit, and push:
   - Commit message: `[auto] followup scheduler: N drafted, N replied, N bounced`
   - Push to origin main

## Step 4: Log to Google Sheet

For each processed entry, log to the Outreach Tracker sheet using the Apps Script endpoint.

Use WebFetch to POST to:
```
https://script.google.com/macros/s/AKfycbxtydJyjn-zoVghE1HHv-Lxgj71E2FQAxk2Va98Bn9RCp50_7Uiiy347djStEqztaKZ/exec
```

POST body (JSON):
```json
{
  "action": "batch_log",
  "api_key": "tscope_og_2026_kx9m",
  "entries": [
    {
      "company": "<entry.company>",
      "domain": "<entry.domain>",
      "founder": "<entry.founder>",
      "email": "<entry.email>",
      "event": "FOLLOWUP_DRAFTED",
      "email_stage": "Email <entry.emailNumber>",   // for round 2, use "R2 Email <n>"
      "thread_id": "<entry.threadId>",
      "notes": "Via Superhuman"
    }
  ]
}
```

Events: `FOLLOWUP_DRAFTED`, `REPLIED`, `BOUNCED`

If the Apps Script call fails, log the error but don't fail the whole run. The entries are already saved in followups.json.

## Step 5: Summary

Print a summary table:

```
=== Follow-up Processing Complete ===
Drafted: N
Replied: N (cadences cancelled)
Bounced: N
Errors:  N
```

List each entry with its result.

## Batch size management

If there are more than 20 due entries, process them in batches of 20 to avoid MCP rate limits. Pause briefly between batches and report progress.

## Notes

- This skill replaces the old GitHub Actions workflow (followup_scheduler.yml + run_scheduler.js) which used Gmail API for draft creation
- Superhuman thread IDs are different from Gmail thread IDs. The thread search step resolves this mapping.
- If a `superhumanThreadId` field exists on an entry, use it directly instead of searching (skip the thread lookup)
- Entry bodies in followups.json are pre-written HTML. Never modify them. The one exception is a
  `round: 2` entry with `needsDraft: true`, which starts empty and is filled in by step 2b-2.
- Round 2 (restart) cadences run Day 0/+2/+5/+10 and are created by `/restart-outreach`. A reply
  cancels every pending entry for the slug regardless of round, which is the intended behavior.
