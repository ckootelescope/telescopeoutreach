#!/usr/bin/env node
/**
 * The health pulse. See OS-ARCHITECTURE.md section 3.2.
 *
 *   node scripts/health.js            print the pulse, send nothing
 *   node scripts/health.js --apply    send it, if there is anything to say
 *   node scripts/health.js --apply --force   send even when everything is fine
 *
 * This exists because of a specific and expensive silence. Two Windows
 * scheduled tasks failed every morning for months: one pointed at a script
 * deleted in July, the other had an unquoted path. Both reported "Ready", both
 * recorded a non-zero exit code, and nobody ever read it. Alongside that: 24
 * drafts sat unsent, the Calendar scope had been 403 since mid-September, and a
 * table had not been written in a week. Every one of those was discoverable and
 * none of them was discovered.
 *
 * Two rules decide whether this works.
 *
 *   Silence means healthy. It only speaks when something needs a human. A daily
 *   "all good" is filtered within a week and then the real one is filtered too.
 *
 *   It is a message, not a panel. A dashboard tile that usually says nothing
 *   trains you to stop looking at it.
 *
 * Delivery is Slack when SLACK_WEBHOOK_URL is set, otherwise an email to Calvin,
 * so this works before anyone configures anything. stdout always gets it, which
 * is what makes the GitHub Actions log useful.
 */
const https = require('https');
const { connect } = require('./db');
const { envv } = require('./gmail_req');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const ME = 'calvin@telescopepartners.com';

// How long each job may stay quiet before that is itself the problem. Roughly
// twice its cadence: a single missed tick is noise, two in a row is a signal.
const EXPECTED_QUIET_MIN = {
  ear: 90,
  send: 45,
  queue: 45,
  health: 2880,
};

const post = (url, body) => new Promise((res, rej) => {
  const u = new URL(url);
  const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
    x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ s: x.statusCode, b: d })); });
  r.on('error', rej); r.write(body); r.end();
});

async function main() {
  const c = await connect();
  const run = (await c.query(
    `insert into job_run (job, runner, status) values ('health', $1, 'running') returning id`,
    [APPLY ? 'robot' : 'manual'])).rows[0].id;

  const broken = [];   // something is actually wrong
  const needsYou = []; // working as designed, waiting on a human
  const stale = [];    // quietly rotting

  const one = async (sql, params = []) => (await c.query(sql, params)).rows;

  try {
    // ---------------------------------------------------------------- jobs
    for (const [job, quiet] of Object.entries(EXPECTED_QUIET_MIN)) {
      if (job === 'health') continue;
      const r = await one(
        `select status, started_at, minutes_ago, error from v_job_health where job = $1`, [job]);
      if (!r.length) { broken.push(`${job.padEnd(8)} has never run`); continue; }
      const h = r[0];
      if (h.status === 'failed') broken.push(`${job.padEnd(8)} last run FAILED: ${String(h.error || '').slice(0, 80)}`);
      else if (h.minutes_ago > quiet) {
        // A throttled run is the system behaving correctly, not a fault.
        const how = h.status === 'throttled' ? 'throttled' : 'quiet';
        broken.push(`${job.padEnd(8)} ${how} for ${Math.round(h.minutes_ago / 60)}h (expected every ${quiet}m)`);
      }
    }

    // -------------------------------------------------------------- queues
    const overdue = await one(
      `select count(*)::int n, min(due_date)::text oldest from market.v_due
        where due_date < pt_today() - 2`);
    if (overdue[0].n > 0) {
      needsYou.push(`${overdue[0].n} market steps overdue, oldest ${overdue[0].oldest}`);
    }

    const drafts = await one(
      `select count(*)::int n, min(ref_date)::text oldest from v_broken_state
        where issue = 'drafted_not_sent' and ref_date < now() - interval '48 hours'`);
    if (drafts[0].n > 0) {
      needsYou.push(`${drafts[0].n} drafts unsent in Superhuman, oldest ${String(drafts[0].oldest).slice(0, 10)}`);
    }

    // ------------------------------------------------- impossible states
    // method and status must agree. When they do not, v_due silently skips the
    // contact and the cadence freezes with no error anywhere. Found 2026-09-23:
    // 15 contacts, 51 frozen steps, 9 of them owed a follow-up to someone who
    // had already received an opener.
    const mism = await one(
      `select count(*)::int n from market.contact
        where (method = 'email'    and status = 'manual')
           or (method = 'salesnav' and status in ('active','queued'))`);
    if (mism[0].n > 0) broken.push(`${mism[0].n} contacts have method and status disagreeing, cadence frozen`);

    const stuck = await one(`select count(*)::int n from market.step where status = 'sending'`);
    if (stuck[0].n > 0) broken.push(`${stuck[0].n} steps stuck mid-send, check the mailbox before retrying`);

    const failed = await one(`select count(*)::int n from market.step where status = 'failed'`);
    if (failed[0].n > 0) needsYou.push(`${failed[0].n} market steps marked failed, will not retry on their own`);

    // --------------------------------------------------------------- stale
    for (const [label, sql] of [
      ['os_task', `select max(created_at) t from os_task`],
      ['os_calendar_event', `select max(synced_at) t from os_calendar_event`],
    ]) {
      try {
        const r = await one(sql);
        const t = r[0] && r[0].t;
        if (!t) { stale.push(`${label} is empty`); continue; }
        const days = Math.floor((Date.now() - new Date(t).getTime()) / 864e5);
        if (days >= 7) stale.push(`${label} has no write in ${days} days`);
      } catch { /* column shape varies; a missing check is better than a crash */ }
    }

    // --------------------------------------------------------------- build
    const lines = [];
    const section = (title, rows) => { if (rows.length) { lines.push(title); rows.forEach(r => lines.push('  ' + r)); lines.push(''); } };
    section('BROKEN', broken);
    section('NEEDS YOU', needsYou);
    section('STALE', stale);

    const healthy = !lines.length;
    const body = healthy
      ? 'TELESCOPE OS - all clear'
      : ['TELESCOPE OS - ' + new Date().toISOString().slice(0, 10), ''].concat(lines).join('\n');

    console.log(body);

    const counts = { broken: broken.length, needs_you: needsYou.length, stale: stale.length };

    if (!APPLY) {
      console.log('\n(report only - pass --apply to deliver)');
      await c.query(`update job_run set finished_at=now(), status='ok', counts=$2 where id=$1`,
        [run, JSON.stringify(counts)]);
      await c.end(); return;
    }

    if (healthy && !FORCE) {
      console.log('\nnothing to say, so nothing sent. Silence is the healthy signal.');
      await c.query(`update job_run set finished_at=now(), status='ok', counts=$2 where id=$1`,
        [run, JSON.stringify({ ...counts, delivered: false })]);
      await c.end(); return;
    }

    const hook = envv().SLACK_WEBHOOK_URL;
    let delivered = 'none';
    if (hook) {
      const r = await post(hook, JSON.stringify({ text: '```\n' + body + '\n```' }));
      delivered = r.s === 200 ? 'slack' : 'slack-failed-' + r.s;
    } else {
      // No webhook configured yet. Mail is not as good, but it is here today and
      // an undelivered pulse is worth nothing.
      const { req, token } = require('./gmail_req');
      const raw = Buffer.from(
        [`From: Telescope OS <${ME}>`, `To: ${ME}`, 'Subject: Telescope OS pulse',
         'Content-Type: text/plain; charset=UTF-8', '', body].join('\r\n')
      ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const t = await token();
      const r = await req({ hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/messages/send',
        method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } },
        JSON.stringify({ raw }));
      delivered = r.s === 200 ? 'email' : 'email-failed-' + r.s;
    }
    console.log('\ndelivered via ' + delivered);
    await c.query(`update job_run set finished_at=now(), status='ok', counts=$2 where id=$1`,
      [run, JSON.stringify({ ...counts, delivered })]);
    await c.end();
  } catch (e) {
    await c.query(`update job_run set finished_at=now(), status='failed', error=$2 where id=$1`,
      [run, String(e.message).slice(0, 400)]).catch(() => {});
    await c.end().catch(() => {});
    throw e;
  }
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
