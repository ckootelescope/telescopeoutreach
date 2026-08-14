# Outreach Console

Next.js app over the Supabase outreach database. Read-only for now; sends,
drafts and reconciliation still run from the scripts in the repo root.

## Setup

1. Unknown command: "install"


Did you mean one of these?
  npm install # Install a package
  npm uninstall # Remove a package
To see a list of supported npm commands, run:
  npm help
2. Copy  to  and fill in:
   -  from Supabase, Project Settings, API
   - , any password you choose
   The service role key bypasses row level security. It is server-only and must
   never be given a  prefix.
3. 
## Deploying to Vercel

- Root directory: `web`
- Add the three env vars from `.env.example`. Nothing else to configure:
  no email provider, no redirect allowlist, no callback URL.

## Access

One password, , checked in  against a signed
cookie. No email is sent, so nothing can rate limit you out of your own
dashboard. Changing the password invalidates every existing session.

 is deliberately reachable without signing in: it reports which
variables are set, never their values, and you cannot sign in until the
configuration is right.

## Where the queries live

In the database, as views and functions, so the app stays a rendering layer:

| Object | Purpose |
|---|---|
| `an_step_performance` | Marginal reply rate per step |
| `an_reply_latency` | Time from first email to reply |
| `an_send_hour` | Reply rate by send hour, Pacific |
| `an_net_new_weekly` | Net-new companies per week, restarts excluded |
| `an_outcome_funnel` | Outcome mix once sequences are tagged |
| `an_trust` | Whether the database still matches the mailbox |
| `guard_check(domain, founder, email)` | Pre-send collision check |
| `upcoming_load(days)` | Scheduled sends per day by engine |

Edit `db/*.sql` and apply with `node scripts/apply_sql.js db/<file>.sql`.
