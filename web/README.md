# Outreach Console

Next.js app over the Supabase outreach database. Read-only for now; sends,
drafts and reconciliation still run from the scripts in the repo root.

## Setup

1. `cd web && npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
     from Supabase → Project Settings → API
   - The service role key bypasses row level security. It is server-only and
     must never be given a `NEXT_PUBLIC_` prefix.
3. In Supabase → Authentication → Providers, enable **Email** with magic link.
4. `npm run dev`

## Deploying to Vercel

- Root directory: `web`
- Add the same four env vars, plus `NEXT_PUBLIC_SITE_URL` set to the
  deployed URL so magic links come back to the right host.
- Add that URL to Supabase → Authentication → URL Configuration → Redirect URLs.

## Access

Every route is behind `middleware.ts`, which requires a Supabase session whose
email is in `ALLOWED_EMAILS`. The allowlist is checked three times: before a
magic link is sent, at the auth callback, and on every request.

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
