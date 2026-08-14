# Outreach Console

Next.js app over the Supabase outreach database. Read-only for now; sends,
drafts and reconciliation still run from the scripts in the repo root.

## Setup

1. `cd web && npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` from Supabase, Project Settings, API
   - `CONSOLE_PASSWORD`, any password you choose

   The service role key bypasses row level security. It is server-only and must
   never be given a `NEXT_PUBLIC_` prefix.
3. `npm run dev`

## Deploying to Vercel

- Root directory: `web`
- Add the three variables from `.env.example`. Nothing else to configure: no
  email provider, no redirect allowlist, no callback URL.

## Access

One password, `CONSOLE_PASSWORD`, checked in `middleware.ts` against an
HMAC-signed cookie that carries its own expiry and is keyed by the password.
A cookie cannot be forged or extended without it, and changing the password
signs out every device.

No email is sent, so nothing can rate limit you out of your own dashboard.

`/api/health` is deliberately reachable without signing in: it reports which
variables are set, never their values, and you cannot sign in until the
configuration is right.

## Where the queries live

In the database, as views and functions, so the app stays a rendering layer
and the scripts share the same definitions:

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
