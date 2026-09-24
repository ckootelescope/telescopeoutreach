#!/usr/bin/env node
/**
 * The robot. One entry point the scheduler calls; everything else is a job.
 * See OS-ARCHITECTURE.md section 2.
 *
 *   node scripts/tick.js                  ear then send  (the normal tick)
 *   node scripts/tick.js --job=send       one job
 *   node scripts/tick.js --job=health     the daily pulse
 *   node scripts/tick.js --dry            show what would run, touch nothing
 *
 * Only deterministic work belongs here. Anything needing judgement or an MCP
 * tool (Granola, Notion, Affinity, Superhuman) cannot run from a cron at all,
 * because those exist only inside a Claude session. That work is the Analyst's,
 * on its own schedule. Putting the boundary in the runner rather than in
 * someone's memory is the point.
 *
 * Every job writes a job_run row whatever happens. That table is the only
 * reason a broken job and a quiet week look different, and the absence of it is
 * how two scheduled tasks failed every morning for two months unnoticed.
 *
 * Exit 75 from a child means EX_TEMPFAIL: throttled, queue untouched, come back
 * later. It is recorded as 'throttled' rather than 'failed' so the health pulse
 * does not page anyone over Gmail asking us to wait a minute.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const jobArg = process.argv.find(a => a.startsWith('--job='));

const JOBS = {
  // Cheap change detection, then the reconcilers only if the mailbox moved.
  ear:    ['scripts/ear.js', '--apply'],
  // One small bite. Pacing lives on step.send_after, so this exits in seconds.
  send:   ['scripts/mo_send.js', '--apply'],
  // Dashboard intents. Cheap, and the only place the web tier reaches Gmail.
  queue:  ['scripts/queue.js', '--apply'],
  health: ['scripts/health.js', '--apply'],
  // One Gmail call. Runs before anything else once a throttle backoff expires.
  probe:  ['scripts/gmail_probe.js'],
};

const DEFAULT = ['ear', 'queue', 'send'];
const EX_TEMPFAIL = 75;

// Jobs that call the Gmail API. All of them share one per-user rate limit.
const GMAIL = new Set(['ear', 'send', 'queue', 'health', 'probe']);

// Minutes of total Gmail silence after the Nth throttle in a row. Once Google
// throttles this mailbox, every call made while throttled restarts a 15-minute
// penalty, and waiting until the "Retry after" time and trying again failed
// three times running on 2026-09-24. A 15-minute tick that made even one call
// would keep the mailbox locked forever. So the robot goes quiet for longer
// than the penalty, longer again on each repeat, and then sends one probe.
const BACKOFF_MIN = [30, 60, 120, 240];

/**
 * The Gmail gate, persisted in job_run so it survives between runs. The last
 * process's in-memory gate (gmail_req's quotaUntil) dies with the process, which
 * is why every tick used to start blind.
 *
 * The streak counts consecutive throttled Gmail jobs, newest first. Only an 'ok'
 * from ear or probe ends it, because those always call Gmail; an 'ok' from send
 * or queue can mean there was nothing to do and Gmail was never asked.
 */
async function gmailGate(c) {
  const rows = (await c.query(
    `select job, status, coalesce(finished_at, started_at) as ts
       from job_run
      where job = any($1) and status in ('ok', 'throttled')
      order by id desc limit 50`, [[...GMAIL]])).rows;
  let strikes = 0, last = null;
  for (const r of rows) {
    if (r.status === 'throttled') { strikes++; last = last || r.ts; continue; }
    if (r.job === 'ear' || r.job === 'probe') break;
  }
  if (!strikes) return { open: true, strikes: 0 };
  const wait = BACKOFF_MIN[Math.min(strikes, BACKOFF_MIN.length) - 1];
  const until = new Date(last).getTime() + wait * 60e3;
  return { open: Date.now() >= until, strikes, until, probe: true };
}

async function main() {
  const wanted = jobArg ? [jobArg.slice(6)] : DEFAULT;
  for (const j of wanted) {
    if (!JOBS[j]) { console.error('unknown job: ' + j + ' (have: ' + Object.keys(JOBS).join(', ') + ')'); process.exit(1); }
  }

  if (DRY) {
    console.log('would run: ' + wanted.join(', '));
    wanted.forEach(j => console.log('  ' + j.padEnd(8) + 'node ' + JOBS[j].join(' ')));
    const c = await connect();
    const g = await gmailGate(c);
    await c.end();
    console.log('gmail gate: ' + (g.open ? 'open' : 'closed') + (g.strikes
      ? `, ${g.strikes} throttle(s) in a row, ${g.open ? 'probe first' : 'silent until ' + new Date(g.until).toISOString()}`
      : ''));
    return;
  }

  const c = await connect();
  let worst = 0;
  let gmailShut = false;

  // Consult the gate before any Gmail job. Closed: record the skip and touch
  // nothing. Just reopened: probe first, and only a clear probe lets jobs run.
  if (wanted.some(j => GMAIL.has(j)) && !wanted.includes('probe')) {
    const g = await gmailGate(c);
    if (!g.open) {
      gmailShut = true;
      const until = new Date(g.until).toISOString();
      await c.query(
        `insert into job_run (job, runner, status, finished_at, counts)
         values ('gate', 'robot', 'skipped', now(), $1)`,
        [JSON.stringify({ strikes: g.strikes, until })]);
      console.log(`[gate] Gmail throttled ${g.strikes}x in a row, silent until ${until}`);
    } else if (g.probe) {
      wanted.unshift('probe');
    }
  }

  for (const job of wanted) {
    if (gmailShut && GMAIL.has(job)) {
      console.log(`[${job}] skipped, Gmail gate closed`);
      continue;
    }
    const run = (await c.query(
      `insert into job_run (job, runner, status) values ($1, 'robot', 'running') returning id`,
      [job])).rows[0].id;
    const t0 = Date.now();

    const r = spawnSync(process.execPath, JOBS[job], { cwd: ROOT, encoding: 'utf8', timeout: 12 * 60e3 });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    let status = 'ok', error = null;
    if (r.status === EX_TEMPFAIL) status = 'throttled';
    else if (r.status !== 0) {
      status = 'failed';
      error = out.split('\n').slice(-6).join('\n').slice(0, 400);
    }

    // Pull whatever the child reported so job_run carries the numbers, not just
    // a colour. "ok" with nothing behind it is the kind of green that hides a
    // job quietly doing nothing.
    const counts = {};
    const sent = /\bsent (\d+), failed (\d+)/.exec(out);
    if (sent) { counts.sent = +sent[1]; counts.failed = +sent[2]; }
    const seen = /new messages since cursor: (\d+)\s+on a tracked thread or address: (\d+)/.exec(out);
    if (seen) { counts.new_mail = +seen[1]; counts.relevant = +seen[2]; }
    if (/reconcilers skipped/.test(out)) counts.reconciled = false;
    else if (/^reconciling /m.test(out)) counts.reconciled = true;

    await c.query(
      `update job_run set finished_at=now(), status=$2, counts=$3, error=$4 where id=$1`,
      [run, status, Object.keys(counts).length ? JSON.stringify(counts) : null, error]);

    console.log(`[${job}] ${status} in ${secs}s` +
      (Object.keys(counts).length ? '  ' + JSON.stringify(counts) : ''));
    if (status !== 'ok') console.log(out.split('\n').slice(-8).join('\n'));

    // A throttle is not worth failing the whole tick over, and the next tick is
    // fifteen minutes away. A real failure should be visible to the scheduler.
    if (status === 'failed') worst = 1;

    // One throttle closes Gmail for the rest of this tick. Carrying on to the
    // next job is one more call into a live penalty, which restarts it.
    if (status === 'throttled' && GMAIL.has(job)) gmailShut = true;
    // A probe that is not clear, for any reason, is not permission to send.
    if (job === 'probe' && status !== 'ok') gmailShut = true;
  }

  await c.end();
  process.exitCode = worst;
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
