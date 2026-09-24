#!/usr/bin/env node
/**
 * The ear: decide cheaply whether the mailbox has changed, and only then pay
 * for a reconcile. See OS-ARCHITECTURE.md section 4.
 *
 *   node scripts/ear.js            report what it would do
 *   node scripts/ear.js --apply    act on it
 *   node scripts/ear.js --apply --force-full   skip the cursor, reconcile anyway
 *
 * The problem this solves: both reconcilers were full sweeps. sync_replies
 * walked every live sequence's thread; mo_sync fetched one Gmail thread per live
 * contact plus metadata per message, over a 45 day lookback, from scratch every
 * run. Around 200 API calls each, scaling with contact count, and on 2026-09-23
 * running them three times in half an hour exhausted the per-user rate limit and
 * stopped real sends.
 *
 * Reconciling every 30 minutes is the whole point of the system, and at 200
 * calls a run that is not affordable.
 *
 * What it deliberately does NOT do: reimplement the reconcilers. Their matching
 * rules are subtle and hard won. mark_sent knows the Nth outbound in a thread is
 * step N. mo_sync matches by thread or exact sender and never by domain, because
 * a dozen experts share one carrier domain. sync_replies knows an out-of-office
 * is not a reply. Rewriting that under time pressure would trade a quota problem
 * for a correctness problem, which is a far worse trade.
 *
 * So the ear is a gate, not a replacement. Gmail's history API answers "has
 * anything arrived since message X" in two or three calls. If nothing relevant
 * has, the expensive reconcilers do not run at all. If something has, they run
 * exactly as before, with their logic untouched.
 *
 * Typical cost: 3 calls on a quiet tick, versus roughly 400 for both sweeps.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { connect } = require('./db');
const { req, token, isParked, throttledUntil } = require('./gmail_req');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const FORCE_FULL = process.argv.includes('--force-full');

const hdrs = m => Object.fromEntries((m.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
const addrs = v => String(v || '').match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];

async function gmail(t, path_) {
  return req({ hostname: 'gmail.googleapis.com', path: path_, method: 'GET',
    headers: { Authorization: 'Bearer ' + t } });
}

/** Run a reconciler as a child so one blowing up cannot take the tick with it. */
function runScript(args, label) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 10 * 60e3 });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log('--- ' + label + ' (exit ' + r.status + ')');
  console.log(out.split('\n').slice(-12).join('\n').trim());
  return { status: r.status, out };
}

async function main() {
  const c = await connect();
  const t = await token();

  // Everything we might care about hearing from.
  const known = new Set();
  for (const r of (await c.query(
    `select lower(email) e from contact where email is not null
     union select lower(email) from market.contact where email is not null`)).rows) {
    known.add(r.e);
  }
  const threads = new Set();
  for (const r of (await c.query(
    `select thread_id id from step where thread_id is not null
     union select thread_id from market.step where thread_id is not null`)).rows) {
    threads.add(r.id);
  }

  const cur = (await c.query(`select history_id from mail_cursor where id = 1`)).rows[0];

  // First run has no cursor, so there is no cheap question to ask. Record where
  // the mailbox is now and let this run do a full reconcile.
  if (!cur || FORCE_FULL) {
    const p = await gmail(t, '/gmail/v1/users/me/profile');
    if (p.s !== 200) {
      console.log('cannot read profile (HTTP ' + p.s + ')' + (isParked() ? ', throttled until ' + new Date(throttledUntil()).toISOString() : ''));
      await c.end();
      process.exitCode = p.throttled ? 75 : 1;
      return;
    }
    const hid = JSON.parse(p.b).historyId;
    console.log((cur ? 'forced full reconcile' : 'no cursor yet, first run') + '; mailbox at historyId ' + hid);
    if (APPLY) {
      await c.query(`insert into mail_cursor (id, history_id) values (1, $1)
                     on conflict (id) do update set history_id = excluded.history_id, updated_at = now()`, [hid]);
      reconcile(known.size, threads.size);
    } else {
      console.log('(report only - pass --apply to set the cursor and reconcile)');
    }
    await c.end();
    return;
  }

  // The cheap question.
  let pageToken = null, ids = [], pages = 0, expired = false;
  do {
    const q = '/gmail/v1/users/me/history?startHistoryId=' + cur.history_id +
              '&historyTypes=messageAdded&maxResults=500' + (pageToken ? '&pageToken=' + pageToken : '');
    const r = await gmail(t, q);
    if (r.s === 404) { expired = true; break; }       // cursor older than Gmail keeps
    if (r.s !== 200) {
      console.log('history read failed (HTTP ' + r.s + ')' + (isParked() ? ', throttled until ' + new Date(throttledUntil()).toISOString() : ''));
      await c.end();
      process.exitCode = r.throttled ? 75 : 1;
      return;
    }
    const j = JSON.parse(r.b);
    for (const h of (j.history || [])) {
      for (const a of (h.messagesAdded || [])) ids.push(a.message);
    }
    pageToken = j.nextPageToken;
    if (j.historyId) cur.next = j.historyId;
    pages++;
  } while (pageToken && pages < 10);

  if (expired) {
    console.log('cursor expired (Gmail keeps roughly a week); falling back to a full reconcile');
    if (APPLY) {
      const p = await gmail(t, '/gmail/v1/users/me/profile');
      if (p.s === 200) {
        await c.query(`update mail_cursor set history_id = $1, updated_at = now() where id = 1`,
          [JSON.parse(p.b).historyId]);
      }
      reconcile(known.size, threads.size);
    }
    await c.end();
    return;
  }

  // Filter to mail that could possibly matter, by thread first because it is
  // free, then by sender for anything new.
  const relevant = [];
  const unknownThread = ids.filter(m => !threads.has(m.threadId));
  for (const m of ids) if (threads.has(m.threadId)) relevant.push(m.id);

  let looked = 0;
  for (const m of unknownThread) {
    if (relevant.length) break;                 // already know we must reconcile
    if (looked++ >= 25) break;                  // cap the probing cost
    const r = await gmail(t, '/gmail/v1/users/me/messages/' + m.id +
      '?format=metadata&metadataHeaders=From&metadataHeaders=To');
    if (r.s !== 200) continue;
    const h = hdrs(JSON.parse(r.b));
    if ([...addrs(h.from), ...addrs(h.to)].some(a => known.has(a.toLowerCase()))) relevant.push(m.id);
  }

  console.log('new messages since cursor: ' + ids.length +
              '   on a tracked thread or address: ' + relevant.length +
              '   (' + (2 + looked) + ' api calls)');

  if (!APPLY) {
    console.log(relevant.length ? '\nwould reconcile' : '\nwould skip the reconcile entirely');
    console.log('\n(report only - pass --apply)');
    await c.end();
    return;
  }

  if (relevant.length) reconcile(known.size, threads.size);
  else console.log('nothing relevant, reconcilers skipped');

  if (cur.next) {
    await c.query(`update mail_cursor set history_id = $1, updated_at = now() where id = 1`, [cur.next]);
  }
  await c.end();
}

/** The expensive part, unchanged, run only when the ear says it is worth it. */
function runAll() {
  runScript(['scripts/mark_sent.js', '--apply'], 'mark_sent');
  runScript(['scripts/sync_replies.js', '--apply'], 'sync_replies');
  runScript(['scripts/mo_sync.js', '--apply'], 'mo_sync');
}
function reconcile(nKnown, nThreads) {
  console.log('reconciling (' + nKnown + ' addresses, ' + nThreads + ' threads tracked)');
  runAll();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
