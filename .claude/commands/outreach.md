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

## Owner check (do this before research, always)

Calvin only sends Round 1 outreach to companies **he owns**. Ownership lives in the **Owner**
column (column H) of the Google Sheet **CG + CK Master Pipeline**
(`1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk`, tabs Break-In, Tracking, Revisit, Priority
Companies). Match on the Website column.

| Owner | Action |
|---|---|
| `CK` | Calvin's. Draft as normal. |
| `CG` | Chris Gaertner's. **Do not draft a direct note from Calvin** unless Calvin explicitly says to for that company. List it as skipped (owner CG). |
| Anyone else (`ZB`, etc.) | Not Calvin's. Skip and list it. |
| Blank or not in the sheet | Ask Calvin before drafting. |

## Block 2 (Email 1 insight paragraph)

**Since 2026-10-17 Block 2 is Calvin's fixed talk track, and the whole email is lowercase.** See the
top section of `references/block2-spec.md`. Research still feeds the one variable one-liner. Steps 1
to 2 below (winners and 3 variants) are retired for Email 1. Still run `block2_check.js` with
`--site`, and still log the draft.

Before drafting, read `references/block2-spec.md` in full, every time. Do not draft Block 2 from
memory of an earlier run.

1. Run `node scripts/winners.js --market "<brief.market>" --about "<brief.what_they_do>"` and read
   every opener it prints. Draft from those, not from the spec's summary.
2. Write 3 variants, each modeled on a named winner.
3. Save the homepage text to `research/<slug>-site.txt`, then run
   `node scripts/block2_check.js --site research/<slug>-site.txt "<paragraph>"` on each variant.
   Any FAIL line (mechanical, voice or homepage) means rewrite. Compare to the last 5 Block 2s.
4. Show Calvin the 3 variants in the spec's Output format, with a pick.
5. Log them: `node scripts/block2_edits.js --log <slug> <file.json>` with
   `{"company","domain","variants":[...],"pick":"A"}`.
6. Build the Superhuman draft with the pick. Calvin can swap in another variant before he sends.

## Steps 1-5

Follow the Round 1 flow in `CLAUDE.md` exactly as written: research subagent producing a Writing
Brief, three-block email, Superhuman draft, then follow-up scheduling on **Day 0/+2/+7/+12** with
subject `Telescope <> [Company] Intro`, plus the LinkedIn calendar reminder.

Do not use the Round 2 subject line, cadence, or templates here. The two rounds are separate
sequences with separate copy.
