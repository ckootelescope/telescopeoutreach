#!/usr/bin/env node
/**
 * Execute queued dashboard intents. See OS-ARCHITECTURE.md section 7.
 *
 *   node scripts/queue.js            report what is waiting
 *   node scripts/queue.js --apply    do it
 *
 * The web app has Supabase and the Anthropic API. It does not have the mailbox,
 * and giving the browser tier the ability to send would put mail credentials
 * behind every button. So a button writes an intent here and the robot performs
 * it on the next tick, which keeps exactly one process able to touch Gmail.
 *
 * The division of labour matters and is deliberate:
 *   composition happens where the Anthropic key is, in the web app
 *   delivery happens where the mailbox is, here
 * So 'draft_investor_email' arrives with its body already written. This script
 * never generates copy. It puts an already-approved body into a Gmail draft, so
 * a bug here can misfile a draft but can never invent words to a real investor.
 *
 * Nothing in this file sends. Every mail action produces a DRAFT that Calvin
 * opens in Superhuman and sends himself, which is the same rule company
 * outreach has always followed.
 */
const { connect } = require('./db');
const { req, token, isParked } = require('./gmail_req');

const APPLY = process.argv.includes('--apply');
const ME = 'calvin@telescopepartners.com';
const ME_NAME = 'Calvin Koo';
const MAX_PER_RUN = 20;
const MAX_ATTEMPTS = 3;

const b64url = b => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encHeader = s => /^[\x20-\x7E]*$/.test(s) ? s
  : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';

function mime({ to, toName, subject, html }) {
  return b64url([
    `From: ${ME_NAME} <${ME}>`,
    to ? `To: ${toName ? '"' + toName.replace(/"/g, '') + '" ' : ''}<${to}>` : `To: ${ME}`,
    'Subject: ' + encHeader(subject),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '', html,
  ].join('\r\n'));
}

async function gmailDraft(t, payload) {
  const raw = mime(payload);
  const r = await req({ hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/drafts',
    method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } },
    JSON.stringify({ message: { raw } }));
  if (r.s !== 200) { const e = new Error('gmail draft ' + r.s + ': ' + r.b.slice(0, 200)); e.throttled = r.throttled; throw e; }
  return JSON.parse(r.b);
}

// Each handler returns a result object, or throws. A throw with .throttled set
// leaves the row queued rather than burning an attempt.
const HANDLERS = {
  /** Record that a LinkedIn touch actually happened. Pure database. */
  async mark_linkedin_touched(c, p) {
    const r = await c.query(
      `update market.nudge set touched_at = now(), channel = $2, note = $3
        where contact_id = $1 returning contact_id`,
      [p.contact_id, p.channel || 'inmail', p.note || null]);
    if (!r.rowCount) throw new Error('no nudge row for contact ' + p.contact_id);
    return { summary: 'linkedin touch recorded' };
  },

  /**
   * An investor touch the mailbox cannot see. Calvin texts people, and without
   * this the investor tab keeps showing someone as never contacted the week
   * after he saw them.
   */
  async log_touch(c, p) {
    const r = await c.query(
      `update os_investor_target set last_outreach = coalesce($2::date, current_date)
        where id = $1 returning id`, [p.target_id, p.happened_on || null]);
    if (!r.rowCount) throw new Error('no investor target ' + p.target_id);
    return { summary: 'touch logged via ' + (p.channel || 'unspecified') };
  },

  /**
   * Put an already-composed body into a Gmail draft. Superhuman is a Gmail
   * client, so it appears there and Calvin sends it himself.
   */
  async draft_investor_email(c, p, t) {
    if (!p.to || !p.subject || !p.body_html) throw new Error('needs to, subject and body_html');
    const d = await gmailDraft(t, { to: p.to, toName: p.to_name, subject: p.subject, html: p.body_html });
    if (p.target_id) {
      await c.query(`update os_investor_target set last_outreach = current_date where id = $1`,
        [p.target_id]).catch(() => {});
    }
    return { summary: 'draft created', draft_id: d.id };
  },

  /** The LinkedIn message as a draft to self, profile URL as the subject. */
  async draft_linkedin(c, p, t) {
    if (!p.contact_id) throw new Error('needs contact_id');
    const ct = (await c.query(
      `select full_name, linkedin_url from market.contact where id = $1`, [p.contact_id])).rows[0];
    if (!ct) throw new Error('no contact ' + p.contact_id);
    const body = (p.body_html || '') ||
      (await c.query(`select body_html from market.step where contact_id=$1 and step_no=1`,
        [p.contact_id])).rows[0]?.body_html;
    if (!body) throw new Error('no body to send');
    const d = await gmailDraft(t, {
      subject: ct.linkedin_url || ('LinkedIn: ' + ct.full_name),
      html: body,
    });
    await c.query(
      `insert into market.nudge (contact_id, draft_id, status) values ($1,$2,'queued')
       on conflict (contact_id) do update set draft_id = excluded.draft_id`, [p.contact_id, d.id]);
    return { summary: 'linkedin draft created', draft_id: d.id };
  },
};

async function main() {
  const c = await connect();
  const pending = (await c.query(
    `select * from action_queue where status = 'queued' and attempts < $2
      order by requested_at limit $1`, [MAX_PER_RUN, MAX_ATTEMPTS])).rows;

  if (!pending.length) { console.log('queue empty'); await c.end(); return; }

  console.log('queued: ' + pending.length);
  pending.forEach(r => console.log('  ' + String(r.id).padStart(5) + '  ' + r.kind.padEnd(24) +
    JSON.stringify(r.payload).slice(0, 70)));

  const unknown = pending.filter(r => !HANDLERS[r.kind]);
  if (unknown.length) {
    console.log('\nUNKNOWN kind (' + unknown.length + '), will be failed:');
    unknown.forEach(r => console.log('  ' + r.id + '  ' + r.kind));
  }

  if (!APPLY) { console.log('\n(report only - pass --apply to execute)'); await c.end(); return; }

  let done = 0, failed = 0, deferred = 0;
  let t = null;
  const needsMail = pending.some(r => /^draft_/.test(r.kind));
  if (needsMail) {
    if (isParked()) { console.log('\nGmail is throttled; leaving mail actions queued.'); }
    else t = await token();
  }

  for (const row of pending) {
    const h = HANDLERS[row.kind];
    if (!h) {
      await c.query(`update action_queue set status='failed', finished_at=now(), error=$2 where id=$1`,
        [row.id, 'unknown kind: ' + row.kind]);
      failed++; continue;
    }
    if (/^draft_/.test(row.kind) && !t) { deferred++; continue; }

    await c.query(`update action_queue set attempts = attempts + 1, started_at = now() where id = $1`, [row.id]);
    try {
      const result = await h(c, row.payload || {}, t);
      await c.query(`update action_queue set status='done', finished_at=now(), result=$2 where id=$1`,
        [row.id, JSON.stringify(result)]);
      console.log('  done  ' + row.id + '  ' + row.kind + '  ' + (result.summary || ''));
      done++;
    } catch (e) {
      // A throttle is not this intent's fault. Give the attempt back so it is
      // retried rather than burned, and stop touching Gmail this run.
      if (e.throttled || isParked()) {
        await c.query(`update action_queue set attempts = greatest(attempts - 1, 0) where id = $1`, [row.id]);
        console.log('  defer ' + row.id + '  throttled, left queued');
        deferred++; t = null; continue;
      }
      const dead = row.attempts + 1 >= MAX_ATTEMPTS;
      await c.query(
        `update action_queue set status=$3, finished_at=case when $3='failed' then now() end, error=$2 where id=$1`,
        [row.id, String(e.message).slice(0, 400), dead ? 'failed' : 'queued']);
      console.log('  ' + (dead ? 'FAIL ' : 'retry') + ' ' + row.id + '  ' + e.message);
      if (dead) failed++;
    }
  }

  console.log('\ndone ' + done + ', failed ' + failed + ', deferred ' + deferred);
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
