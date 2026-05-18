# Telescope Outreach System

## What This Repo Does

This is the automated follow-up engine for Calvin Koo's outreach at Telescope Partners. GitHub Actions runs scheduled workflows that check for replies and create follow-up email drafts in Calvin's Gmail/Superhuman inbox.

## How It Works

1. Calvin sends Email 1 manually from Superhuman
2. Follow-up emails (Email 2 at +48hrs, Email 3 at +5 days after Email 2) are scheduled as GitHub Actions workflows
3. On the scheduled date, each workflow:
   - Authenticates with Gmail using stored credentials
   - Checks for replies from the company domain (ignoring auto-replies and bounces)
   - If no reply: creates a follow-up draft threaded onto the original conversation
   - If reply detected: cancels all remaining follow-ups and cleans up workflow files
   - Self-deletes after execution

## Repo Structure

```
.github/workflows/
  test_connection.yml                    # Gmail API test
  followup_{company_slug}_email2.yml     # Auto-generated per company
  followup_{company_slug}_email3.yml     # Auto-generated per company
scripts/
  send_followup.js                       # Core: reply detection + draft creation
  generate_followup.js                   # Generates workflow files from template
  push_followups.js                      # Pushes workflow files via GitHub API
templates/
  followup_template.yml                  # Base template for workflows
.env                                     # GH_PAT (gitignored)
```

## Your Job (Claude Code)

When Calvin asks you to schedule follow-ups, you need to:

1. Take the cadence data he provides (company name, founder, email, domain, thread ID, message ID, subject, Email 2 body + date, Email 3 body + date)
2. Generate workflow YAML files using the template at `templates/followup_template.yml`
3. Push them to this repo using the GitHub API with the PAT from `.env`

### Generating Workflow Files

For each company, create 2 workflow files:
- `.github/workflows/followup_{slug}_email2.yml`
- `.github/workflows/followup_{slug}_email3.yml`

Where `{slug}` is the company name lowercased with non-alphanumeric chars replaced by underscores.

### Cron Schedule

Convert the follow-up date to a cron expression. Use hour 15 UTC (8am PT) with randomized minutes (10-39) to stagger sends.

Format: `{minute} 15 {day} {month} *`

Example: May 19 → `22 15 19 5 *`

### Pushing to GitHub

Use the GitHub Contents API to create files:

```
PUT /repos/ckootelescope/telescopeoutreach/contents/{path}
Authorization: Bearer {GH_PAT}
{
  "message": "[outreach] schedule Email {N} for {company}",
  "content": "{base64_encoded_workflow_content}"
}
```

If the file already exists (returns sha), include the sha in the PUT to update it.

### Template Placeholders

When reading `templates/followup_template.yml`, replace these placeholders:

| Placeholder | Replace With |
|-------------|-------------|
| `CRON_SCHEDULE` | Generated cron expression |
| `COMPANY_NAME` | Company display name |
| `COMPANY_NAME_VALUE` | Company display name (in env vars) |
| `FOUNDER_NAME_VALUE` | Founder's full name |
| `FOUNDER_EMAIL_VALUE` | Founder's email |
| `COMPANY_DOMAIN_VALUE` | Company domain |
| `THREAD_ID_VALUE` | Gmail thread ID |
| `MESSAGE_ID_VALUE` | Gmail message ID |
| `EMAIL_SUBJECT_VALUE` | Original email subject line |
| `EMAIL_BODY_VALUE` | HTML body of the follow-up email |
| `EMAIL_NUMBER` | "2" or "3" |
| `EMAIL_NUMBER_VALUE` | "2" or "3" (in env vars) |
| `COMPANY_SLUG` | Slugified company name |
| `WORKFLOW_FILENAME` | The workflow filename itself |

### Cancel Outreach

If Calvin asks to cancel a cadence for a company, delete all workflow files matching `followup_{slug}_*` from `.github/workflows/` using the GitHub API.

## GitHub Secrets (already configured)

| Secret | Purpose |
|--------|---------|
| `GMAIL_CLIENT_ID` | Google OAuth |
| `GMAIL_CLIENT_SECRET` | Google OAuth |
| `GMAIL_REFRESH_TOKEN` | Calvin's Gmail access |
| `GMAIL_SENDER_EMAIL` | Calvin's email |
| `GH_PAT` | GitHub API access for pushing files |

## Email Tone Guidelines

Follow-up emails must:
- Bring NEW value (market insight, portfolio anecdote, strategic question)
- Never say "just following up" or "bumping this"
- Be written in plain, casual language (like explaining to a friend)
- No double dashes (em dashes)
- No "My name is Calvin" (redundant with signature)
- No sign-off (Superhuman signature handles it)
- Email 2: shorter than Email 1, includes a market insight or strategic question
- Email 3: shortest of all, includes a portfolio anecdote, ends with "if now isn't the right time, totally understand"
