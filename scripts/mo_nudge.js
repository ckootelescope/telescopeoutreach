#!/usr/bin/env node
/**
 * Create the LinkedIn/InMail drafts for SalesNav-only contacts.
 * See market-outreach/SPEC.md
 *
 *   node scripts/mo_nudge.js <slug>            report only
 *   node scripts/mo_nudge.js <slug> --apply
 *
 * A contact the gate routed to SalesNav never receives an email, so mo_send
 * never runs for them and no nudge is ever created. Without this they exist
 * only as a row in a CSV, which is exactly the "I'll do it manually" pile that
 * quietly never gets done.
 *
 * Each draft lands in Calvin's own inbox with the profile URL as the subject,
 * so it is one click to the profile and one paste into InMail. It is the step-1
 * copy for that contact's angle, rendered exactly as an email would have been.
 */
const { connect } = require('./db');
const { req, token } = require('./gmail_req');
const { render, subject: subjectOf, guard, toText } = require('./mo_render');
const crypto = require('crypto');
const lock = require('./mo_lock');

const APPLY = process.argv.includes('--apply');
// By default only SalesNav contacts get a nudge, because an emailed contact is
// already in a thread. --all covers everyone on the project: Calvin wants the
// LinkedIn touch alongside the email, not instead of it.
const ALL = process.argv.includes('--all');
// Rewrite drafts that already exist, for when the copy changed underneath them.
// Without this a copy fix reaches new contacts only, and the drafts already
// sitting in the inbox quietly keep the old wording.
const REFRESH = process.argv.includes('--refresh');
const ME = 'calvin@telescopepartners.com';
// Drafts are cheap but not free. Gmail's per-user rate limit is what bit us
// earlier today, and this can run while mo_send is mid-batch, so pace it.
const GAP_MS = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encHeader = s =>
  /^[\x20-\x7E]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';

/**
 * Rewrite an existing draft in place. When the copy changes after the drafts
 * exist, updating beats delete-and-recreate: the draft keeps its id, so
 * market.nudge stays correct even if this dies halfway through.
 */
async function redraft(t, draftId, subject, html) {
  const raw = mimeOf(subject, html);
  const payload = JSON.stringify({ message: { raw: b64url(raw) } });
  const r = await req({ hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/drafts/' + draftId,
    method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload) } }, payload);
  if (r.s !== 200) throw new Error('redraft ' + r.s + ': ' + r.b.slice(0, 160));
  return JSON.parse(r.b);
}

function mimeOf(subject, html) {
  return [
    'From: Calvin Koo <' + ME + '>',
    'To: ' + ME,
    'Subject: ' + encHeader(subject),
    'Message-ID: <' + crypto.randomUUID() + '@telescopepartners.com>',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].join('\r\n') + '\r\n\r\n' +
    Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
}

async function draft(t, subject, html) {
  const raw = [
    'From: Calvin Koo <' + ME + '>',
    'To: ' + ME,
    'Subject: ' + encHeader(subject),
    'Message-ID: <' + crypto.randomUUID() + '@telescopepartners.com>',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].join('\r\n') + '\r\n\r\n' +
    Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  const payload = JSON.stringify({ message: { raw: b64url(raw) } });
  const r = await req({ hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/drafts',
    method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload) } }, payload);
  if (r.s !== 200) throw new Error('draft ' + r.s + ': ' + r.b.slice(0, 160));
  return JSON.parse(r.b);
}

async function main() {
  const slug = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!slug) { console.error('usage: mo_nudge.js <project-slug> [--apply]'); process.exit(1); }
  const c = await connect();

  const pr = await c.query(`select * from market.project where slug=$1`, [slug]);
  if (!pr.rows.length) { console.error('no project ' + slug); await c.end(); process.exit(1); }
  const project = pr.rows[0];
  const blocks = {};
  for (const b of (await c.query(`select * from market.copy_block where project_id=$1`, [project.id])).rows) {
    blocks[b.angle] = b;
  }

  const rows = (await c.query(`
    select ct.* from market.contact ct
     where ct.project_id = $1 ${ALL ? '' : "and ct.method = 'salesnav'"}
       and ${REFRESH ? 'exists' : 'not exists'} (select 1 from market.nudge n where n.contact_id = ct.id)
     order by ct.full_name`, [project.id])).rows;

  if (!rows.length) {
    console.log(REFRESH ? 'no existing drafts to refresh' : 'every contact already has a nudge draft');
    await c.end(); return;
  }

  const ready = [], blocked = [];
  for (const ct of rows) {
    const block = blocks[ct.angle];
    if (!block) { blocked.push({ ct, why: 'no copy block for angle ' + ct.angle }); continue; }
    const html = render(1, project, block, ct);
    const g = guard(html, project);
    if (g.length) { blocked.push({ ct, why: g.join('; ') }); continue; }
    ready.push({ ct, html });
  }

  console.log((ALL ? 'contacts' : 'SalesNav contacts') +
    (REFRESH ? ' whose draft will be rewritten: ' : ' needing a draft: ') + rows.length);
  ready.forEach(r => console.log('  ' + r.ct.full_name.padEnd(22) + (r.ct.company_name || '-').padEnd(22) + r.ct.angle));
  if (blocked.length) {
    console.log('\nBLOCKED (' + blocked.length + ')');
    blocked.forEach(b => console.log('  ' + b.ct.full_name.padEnd(22) + b.why));
  }

  if (!APPLY) {
    if (ready.length) {
      console.log('\n--- preview: ' + ready[0].ct.full_name + ' ---');
      console.log('Subject: ' + ready[0].ct.linkedin_url);
      console.log(toText(ready[0].html));
    }
    console.log('\n(report only - pass --apply to create the drafts)');
    await c.end();
    return;
  }

  const lockedBy = lock.acquire('mo_nudge');
  if (lockedBy) {
    console.log('\nREFUSING: another market-outreach Gmail job holds the lock: ' + lockedBy);
    console.log('Wait for it to finish. Running both trips the rate limit and breaks real sends.');
    await c.end();
    return;
  }

  const t = await token();
  let n = 0;
  for (const r of ready) {
    const body = '<div><b>' + subjectOf(project, r.ct) + '</b></div><div><br></div>' + r.html;
    const existing = REFRESH
      ? (await c.query('select draft_id from market.nudge where contact_id = $1', [r.ct.id])).rows[0]
      : null;
    const d = existing ? await redraft(t, existing.draft_id, r.ct.linkedin_url, body)
                       : await draft(t, r.ct.linkedin_url, body);
    await c.query(
      `insert into market.nudge (contact_id, draft_id, status) values ($1,$2,'queued')
       on conflict (contact_id) do update set draft_id = excluded.draft_id`, [r.ct.id, d.id]);
    n++;
    console.log('  ' + (existing ? 'rewrote ' : 'drafted ') + r.ct.full_name);
    if (n < ready.length) await sleep(GAP_MS);
  }
  console.log('\n' + n + ' InMail draft(s) in your inbox. Subject line is the profile URL.');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
