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
https://script.google.com/a/macros/telescopepartners.com/s/AKfycbxDjUpxiCfDLXlvpqogZZGJqV_qSawC-Y8JLbFoKxh-guq4MmrGBUObo90EQ9kdFfqm/exec
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
      "email_stage": "Email <entry.emailNumber>",
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
- Entry bodies in followups.json are pre-written HTML. Never modify them.
