// Shared Gmail HTTP client for the reconcile scripts.
//
// This exists because of one specific failure that cost real reply data:
// Gmail signals a rate limit with **403**, not 429. The body reads
//
//   "Quota exceeded for quota metric 'Total Query Cost' and limit
//    'Units per minute per user' of service 'gmail.googleapis.com'"
//
// A 403 looks like a permission error, so a retry set built around 429/5xx
// never retried it. Each caller then read the non-200 as "nothing there", which
// is indistinguishable from a clean empty result: mark_sent reported 0 sends and
// sync_replies reported 0 replies while the mailbox actually held 18 and 4.
//
// Two things follow from the quota being **per minute**:
//   1. A short exponential backoff is useless. The window has to roll over.
//   2. Backing off one request is useless while N workers keep hammering. Once
//      the quota is hit, every worker has to stop, so the gate below is global.
//
// A 404 is left alone on purpose. An old thread that has been deleted is gone,
// not throttled, and the callers already treat a failed fetch as "no data" for
// that thread. Counting it as a sweep failure would block every write forever.
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');

// Retryable transport-level statuses. 403 is handled separately because it is
// only retryable when the body says quota, and is a hard failure otherwise.
//
// 429 used to live here, and that was wrong. A 429 IS a rate limit, so treating
// it as an ordinary blip meant eight rapid retries over ~30 seconds, which only
// deepened the throttle, and then a non-200 the caller read as failure. On
// 2026-09-23 that wrote 'failed' onto six real steps over a limit that cleared
// by itself. It now goes down the quota path with 403-quota.
const RETRYABLE = new Set([500, 502, 503, 504]);
const QUOTA_PAUSE_MS = 62000;   // one minute plus a little, so the window rolls
// Longest we will sit and wait inside a single request. Beyond this the caller
// is told to stop instead: an unattended tick must not block for hours, and
// Google has handed back retry-after timestamps 12 hours out.
const MAX_GATE_WAIT_MS = 90000;

const isQuota = (code, body) =>
  code === 429 ||
  (code === 403 && /quota exceeded|rate ?limit ?exceeded|userRateLimitExceeded/i.test(String(body)));

/**
 * Google states when to come back, in the body, as
 * "User-rate limit exceeded.  Retry after 2026-09-24T06:15:35.798Z".
 * Honouring that is the difference between waiting out a one-minute window and
 * hammering a twelve-hour one. Falls back to the fixed pause when absent.
 */
function retryAfterMs(body) {
  const m = /retry after (\d{4}-\d\d-\d\dT[\d:.]+Z)/i.exec(String(body));
  if (!m) return QUOTA_PAUSE_MS;
  const ms = Date.parse(m[1]) - Date.now();
  if (!Number.isFinite(ms)) return QUOTA_PAUSE_MS;
  return Math.max(QUOTA_PAUSE_MS, Math.min(ms + 2000, 24 * 3600e3));
}

let quotaUntil = 0;      // global gate: no worker sends before this timestamp
let hardFails = 0;       // non-200s that are NOT a benign 404
let quotaHits = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** True when the gate is set further out than we are willing to wait. */
const parked = () => quotaUntil - Date.now() > MAX_GATE_WAIT_MS;

async function gate() {
  while (!parked() && Date.now() < quotaUntil) {
    await sleep(Math.min(2000, quotaUntil - Date.now()));
  }
}

/**
 * Config, real environment first so CI can pass secrets without writing a .env
 * to the runner's disk. The file remains the local path and is optional.
 */
function envv() {
  const e = {};
  try {
    fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
      .forEach(l => { const i = l.indexOf('='); if (i > 0) e[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
  for (const k of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN',
                   'SLACK_WEBHOOK_URL', 'SUPABASE_DB_URL']) {
    if (process.env[k]) e[k] = process.env[k];
  }
  return e;
}

function once(o, body) {
  return new Promise((res, rej) => {
    const r = https.request(o, x => {
      let d = ''; x.on('data', c => d += c);
      x.on('end', () => res({ s: x.statusCode, b: d }));
    });
    r.on('error', rej);
    if (body) r.write(body);
    r.end();
  });
}

/**
 * Request with a global quota gate. Resolves {s, b} like the old helper, so
 * callers keep their `if (r.s !== 200) continue` shape.
 */
async function req(o, body, tries = 8) {
  for (let n = tries; ; n--) {
    // Parked means Google told us to come back in hours, not seconds. Answer
    // without touching the network: every attempt against a live throttle is
    // counted and pushes the window further out, which is how a twelve minute
    // wait became a twelve hour one.
    if (parked()) {
      quotaHits++;
      return { s: 429, b: 'throttled locally until ' + new Date(quotaUntil).toISOString(), throttled: true };
    }
    await gate();
    let r;
    try {
      r = await once(o, body);
    } catch (e) {
      if (n <= 1) throw e;
      await sleep(700);
      continue;
    }
    if (r.s === 200 || r.s === 204) return r;

    if (isQuota(r.s, r.b)) {
      quotaHits++;
      // Stop every worker, not just this one, until Google's own window rolls.
      quotaUntil = Math.max(quotaUntil, Date.now() + retryAfterMs(r.b));
      // A long park is not something to retry around. Hand it straight back so
      // the caller can abort the run and leave its queue untouched.
      if (parked()) { r.throttled = true; return r; }
      if (n <= 1) { hardFails++; r.throttled = true; return r; }
      continue;                       // does not consume the short-retry budget
    }
    if (RETRYABLE.has(r.s) && n > 1) {
      await sleep((tries - n + 1) * 1500 + Math.random() * 600);
      continue;
    }
    // 404 on a thread that no longer exists is expected, not a sweep failure.
    if (r.s !== 404) hardFails++;
    return r;
  }
}

async function token() {
  const e = envv();
  const b = new URLSearchParams({ client_id: e.GMAIL_CLIENT_ID, client_secret: e.GMAIL_CLIENT_SECRET,
    refresh_token: e.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
  const r = await req({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, b);
  if (r.s !== 200) throw new Error('token refresh failed: ' + r.b.slice(0, 200));
  return JSON.parse(r.b).access_token;
}

module.exports = {
  req, token, envv,
  httpFails: () => hardFails,
  quotaHits: () => quotaHits,
  /** 0 when clear, otherwise the ms timestamp Google asked us to wait until. */
  throttledUntil: () => (quotaUntil > Date.now() ? quotaUntil : 0),
  /** True when a run should stop rather than keep trying. */
  isParked: () => parked(),
};
