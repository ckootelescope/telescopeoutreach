---
description: Start a net-new (Round 1) outreach cadence for a company never contacted before. Trigger with "/outreach <url>" or "outreach to <url>".
---

# Outreach (Round 1, net new)

For companies with **no prior outreach history**. Calvin provides only a URL.

## Step 0: Verify this is actually net new (do this first, always)

Before any research, confirm the company has no history:

1. Read `followups.json`. Search `pending` for any entry whose `domain` or `company` matches.
2. If entries exist, **stop and report** rather than proceeding:
   - Any entry with `status: "replied"` → the founder already responded. Do not cold-email them.
     Tell Calvin and stop.
   - Any entry with `status: "pending"` → a cadence is live right now. Tell Calvin the next send
     date and stop.
   - Only `completed` / `cancelled` / `bounced` entries → this is a **restart**, not net new.
     Say so and ask whether to run `/restart-outreach <domain>` instead. Do not proceed here.
3. If no entries exist, continue. The Affinity 90-day check in the research step still applies.

This guard exists because the Round 1 opener ("I love what you're building at [Company] and
wanted to see if you're free to chat next week?") reads as a first contact. Sending it to a
founder who has already received four emails is the worst failure mode in this system.

## Steps 1-5

Follow the Round 1 flow in `CLAUDE.md` exactly as written: research subagent producing a Writing
Brief, three-block email, Superhuman draft, then follow-up scheduling on **Day 0/+2/+7/+12** with
subject `Telescope <> [Company] Intro`, plus the LinkedIn calendar reminder.

Do not use the Round 2 subject line, cadence, or templates here. The two rounds are separate
sequences with separate copy.
