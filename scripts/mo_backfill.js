#!/usr/bin/env node
/**
 * Adopt an outreach batch that was sent by hand, so the 4-step engine can take
 * over the follow-ups.  See market-outreach/SPEC.md
 *
 *   node scripts/mo_backfill.js <slug>            report only
 *   node scripts/mo_backfill.js <slug> --apply
 *   node scripts/mo_backfill.js <slug> --roster=market-outreach/pathwork/roster.csv
 *
 * Step 1 already went out through Superhuman, so its thread and RFC Message-ID
 * only exist in the mailbox. mo_send needs both to thread follow-ups, so this
 * reads the sent mail and adopts what it finds. The mailbox is the source of
 * truth for who was actually emailed: a roster CSV is only used to attach names,
 * companies and angles, never to decide that someone was contacted.
 *
 * Anyone who already replied is adopted as 'replied' and gets no follow-up.
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');
const { req, token, httpFails } = require('./gmail_req');
const { render, subject: subjectOf } = require('./mo_render');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const rosterArg = process.argv.find(a => a.startsWith('--roster='));
const daysArg = process.argv.find(a => a.startsWith('--days='));
const DAYS = daysArg ? Number(daysArg.slice(7)) : 120;
const ME = 'calvin@telescopepartners.com';

const OFFSETS = [0, 2, 5, 7];
const MIN_GAP_DAYS = 2;     // never two follow-ups to one person inside 2 days

const H = ['From', 'To', 'Subject', 'Date', 'Message-ID', 'Auto-Submitted', 'X-Autoreply',
  'Precedence', 'List-Unsubscribe', 'List-Id'].map(h => 'metadataHeaders=' + h).join('&');
const addrs = s => (String(s || '').match(/[\w.+-]+@[\w.-]+/g) || []).map(x => x.toLowerCase());
const nameOf = s => { const m = String(s || '').match(/^\s*"?([^"<]+?)"?\s*</); return m ? m[1].trim() : ''; };
const hdrs = m => { const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value); return h; };
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5));
const maxDate = (a, b) => (a > b ? a : b);

const isBulk = h => Boolean(h['list-unsubscribe'] || h['list-id']);
const isAuto = h => {
  const a = String(h['auto-submitted'] || '').toLowerCase();
  if (a && a !== 'no') return true;
  if (h['x-autoreply']) return true;
  const s = String(h.subject || '');
  return /^\s*(re:\s*)?(automatic(al)?\s+reply|auto(matic)?[-\s]?reply|out\s+of\s+(the\s+)?office|away\s+from)/i.test(s)
      || /\bout of office\b/i.test(s)
      || /^(accepted|declined|tentative|invitation|updated invitation|cancelled event):/i.test(s);
};

async function listAll(t, q) {
  const out = []; let page = '';
  for (;;) {
    const r = await req({ hostname: 'gmail.googleapis.com',
      path: `/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=500` + (page ? '&pageToken=' + page : ''),
      method: 'GET', headers: { Authorization: 'Bearer ' + t } });
    if (r.s !== 200) throw new Error('gmail list ' + r.s + ': ' + r.b.slice(0, 160));
    const j = JSON.parse(r.b);
    out.push(...(j.messages || []));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}
async function meta(t, id) {
  const r = await req({ hostname: 'gmail.googleapis.com',
    path: `/gmail/v1/users/me/messages/${id}?format=metadata&${H}`,
    method: 'GET', headers: { Authorization: 'Bearer ' + t } });
  return r.s === 200 ? JSON.parse(r.b) : null;
}

/** Roster CSV: Name,Title,Company,LinkedIn URL[,Angle] - names only, no emails. */
function readRoster(p) {
  if (!p || !fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  const split = l => { const o = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; }
    o.push(cur); return o.map(x => x.trim()); };
  const head = split(lines[0]).map(h => h.toLowerCase());
  const ix = n => head.indexOf(n);
  return lines.slice(1).map(split).map(c => ({
    name: c[ix('name')] || '', title: c[ix('title')] || '', company: c[ix('company')] || '',
    linkedin: c[ix('linkedin url')] || '', angle: (ix('angle') >= 0 ? c[ix('angle')] : '') || 'customer',
  })).filter(r => r.name);
}
const normName = s => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  const slug = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!slug) { console.error('usage: mo_backfill.js <project-slug> [--roster=x.csv] [--apply]'); process.exit(1); }

  const c = await connect();
  const pr = await c.query(`select * from market.project where slug=$1`, [slug]);
  if (!pr.rows.length) { console.error('no project ' + slug); await c.end(); process.exit(1); }
  const project = pr.rows[0];
  const blocks = {};
  for (const b of (await c.query(`select * from market.copy_block where project_id=$1`, [project.id])).rows) blocks[b.angle] = b;

  const t = await token();
  const subj = subjectOf(project);
  // Match on the distinctive tail of the subject so a reworded prefix still hits.
  const needle = subj.replace(/^Telescope Partners \| /, '');

  const stubs = await listAll(t, `from:me subject:"${needle}" newer_than:${DAYS}d`);
  const sent = new Map();                       // email -> earliest send
  for (const s of stubs) {
    const m = await meta(t, s.id);
    if (!m || !(m.labelIds || []).includes('SENT')) continue;
    const h = hdrs(m);
    const to = addrs(h.to)[0];
    if (!to || /@telescopepartners\.com$/i.test(to)) continue;
    const rec = { email: to, name: nameOf(h.to), thread: m.threadId, gmail_id: m.id,
      rfc: h['message-id'] || null, ts: Number(m.internalDate), date: iso(new Date(Number(m.internalDate) - 7 * 3600e3)) };
    if (!sent.has(to) || sent.get(to).ts > rec.ts) sent.set(to, rec);
  }

  // Replies, so nobody who already answered gets a follow-up.
  const replied = new Set(), held = new Set();
  const emails = [...sent.keys()];
  for (let i = 0; i < emails.length; i += 20) {
    const group = emails.slice(i, i + 20);
    for (const s of await listAll(t, `from:{${group.join(' ')}} newer_than:${DAYS}d`)) {
      const m = await meta(t, s.id);
      if (!m) continue;
      const h = hdrs(m);
      const from = addrs(h.from)[0];
      if (!from || !sent.has(from)) continue;
      if (isBulk(h)) continue;
      if (isAuto(h)) { held.add(from); continue; }
      replied.add(from);
    }
  }

  if (httpFails()) {
    console.log('WARNING: ' + httpFails() + ' gmail requests failed. Sweep INCOMPLETE, not writing.');
    if (APPLY) { await c.end(); process.exit(2); }
  }

  const roster = readRoster(rosterArg ? path.join(ROOT, rosterArg.slice(9)) : null);
  const byName = new Map(roster.map(r => [normName(r.name), r]));

  const existing = new Set((await c.query(
    `select lower(email) e from market.contact where project_id=$1 and email is not null`, [project.id]))
    .rows.map(r => r.e));

  const today = (await c.query('select pt_today()::text t')).rows[0].t;

  const plan = [];
  for (const rec of sent.values()) {
    if (existing.has(rec.email)) continue;
    const r = byName.get(normName(rec.name)) || {};
    const angle = r.angle || 'customer';

    // Schedule remaining steps. Natural dates come off the real send date, but
    // nothing is ever scheduled into the past and no two follow-ups land inside
    // MIN_GAP_DAYS of each other. Without this, a batch sent weeks ago would
    // fire steps 2, 3 and 4 at the same person on the same morning.
    const steps = [];
    let prev = null;
    for (let i = 1; i < 4; i++) {
      const natural = addDays(rec.date, OFFSETS[i]);
      let due = maxDate(natural, today);
      if (prev) due = maxDate(due, addDays(prev, MIN_GAP_DAYS));
      steps.push({ step_no: i + 1, due });
      prev = due;
    }
    plan.push({ rec, roster: r, angle, steps,
      status: replied.has(rec.email) ? 'replied' : 'active',
      ooo: held.has(rec.email), block: blocks[angle] });
  }

  const adopt = plan.filter(p => p.status === 'active' && p.block);
  const done  = plan.filter(p => p.status === 'replied');
  const noBlk = plan.filter(p => p.status === 'active' && !p.block);

  console.log('project: ' + project.anchor_company + '  subject: ' + subj);
  console.log('openers found in sent mail: ' + sent.size + '   already in the tracker: ' + existing.size);
  console.log('');
  console.log('ADOPT, follow-ups will resume (' + adopt.length + ')');
  adopt.forEach(p => console.log('  ' + (p.rec.name || '?').padEnd(24) + p.rec.email.padEnd(36) +
    'E1 ' + p.rec.date + '  ->  E2 ' + p.steps[0].due + '  E3 ' + p.steps[1].due + '  E4 ' + p.steps[2].due +
    (p.ooo ? '   [had an OOO]' : '')));
  console.log('\nALREADY REPLIED, no follow-up (' + done.length + ')');
  done.forEach(p => console.log('  ' + (p.rec.name || '?').padEnd(24) + p.rec.email));
  if (noBlk.length) {
    console.log('\nNO COPY BLOCK for their angle (' + noBlk.length + ')');
    noBlk.forEach(p => console.log('  ' + (p.rec.name || '?').padEnd(24) + 'angle=' + p.angle));
  }
  if (!project.fu3_insight_html) console.log('\nNOTE: no step-4 insight on this project; E4 stages with no body and will not send.');

  const unmatched = [...sent.values()].filter(r => !byName.has(normName(r.name)));
  if (roster.length && unmatched.length) {
    console.log('\nnot found in the roster CSV, company/title left blank (' + unmatched.length + ')');
    unmatched.forEach(r => console.log('  ' + (r.name || '?').padEnd(24) + r.email));
  }

  if (!APPLY) { console.log('\n(report only - pass --apply to adopt)'); await c.end(); return; }

  let n = 0;
  await c.query('begin');
  for (const p of plan) {
    if (p.status === 'active' && !p.block) continue;
    const r = p.roster;
    const first = (p.rec.name || '').split(/\s+/)[0] || '';
    const ct = (await c.query(
      `insert into market.contact (project_id, full_name, first_name, title, company_name,
          company_domain, linkedin_url, angle, email, email_status, gate_reason, method, status, ended_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'verified','adopted from sent mail','email',$10,$11) returning id`,
      [project.id, p.rec.name || p.rec.email, first, r.title || null, r.company || null,
       (p.rec.email.split('@')[1] || null), r.linkedin || 'unknown', p.angle, p.rec.email,
       p.status, p.status === 'replied' ? today : null])).rows[0].id;

    // Step 1 as it actually went out.
    await c.query(
      `insert into market.step (contact_id, step_no, due_date, subject, status, sent_at, thread_id, message_id, rfc_message_id)
       values ($1,1,$2,$3,'sent',$4,$5,$6,$7)`,
      [ct, p.rec.date, subj, new Date(p.rec.ts).toISOString(), p.rec.thread, p.rec.gmail_id, p.rec.rfc]);
    await c.query(
      `insert into market.event (contact_id, project_id, direction, kind, sender_email, peer_email,
          thread_id, message_id, subject, sent_at)
       values ($1,$2,'out','outbound',$3,$4,$5,$6,$7,$8) on conflict (message_id) do nothing`,
      [ct, project.id, ME, p.rec.email, p.rec.thread, p.rec.gmail_id, subj, new Date(p.rec.ts).toISOString()]);

    if (p.status === 'active') {
      for (const s of p.steps) {
        const html = render(s.step_no, project, p.block, { first_name: first, company_name: r.company || '' });
        await c.query(
          `insert into market.step (contact_id, step_no, due_date, subject, body_html)
           values ($1,$2,$3,$4,$5)`, [ct, s.step_no, s.due, 'Re: ' + subj, html]);
      }
    }
    n++;
  }
  await c.query('commit');
  console.log('\nadopted ' + n + ' contacts. Nothing sent. Run mo_send.js to send what is due.');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
