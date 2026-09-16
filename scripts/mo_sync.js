#!/usr/bin/env node
/**
 * Reconcile market outreach: replies, bounces, bookings, out-of-office.
 * See market-outreach/SPEC.md
 *
 *   node scripts/mo_sync.js            report only
 *   node scripts/mo_sync.js --apply
 *
 * Matching is by the thread of a step we sent, or by an EXACT sender address.
 * Never by domain. The company engine matches by company domain, which is right
 * there because one company means one founder. Here a single project routinely
 * holds a dozen experts at one carrier, and domain matching would stop all
 * twelve the moment one of them replied.
 */
const { connect } = require('./db');
const { req, token, httpFails } = require('./gmail_req');

const APPLY = process.argv.includes('--apply');
const ME = 'calvin@telescopepartners.com';
const LOOKBACK = 45;        // days of mail to consider
const OOO_PUSH = 5;         // days to defer remaining steps on an out-of-office

const HEADERS = ['From', 'To', 'Subject', 'Date', 'Auto-Submitted', 'X-Autoreply',
  'Precedence', 'List-Unsubscribe', 'List-Id'].map(h => 'metadataHeaders=' + h).join('&');

const addrs = s => (String(s || '').match(/[\w.+-]+@[\w.-]+/g) || []).map(x => x.toLowerCase());
const hdrs = m => { const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value); return h; };

const isBounce = from => /mailer-daemon|postmaster/i.test(from);
const isUs = from => /@telescopepartners\.com$/i.test(from);
const isRobot = from => /calendar-notification|no-?reply|noreply|notifications?@/i.test(from);

const isBulk = h => Boolean(h['list-unsubscribe'] || h['list-id']);

const isAutoReply = h => {
  const auto = String(h['auto-submitted'] || '').toLowerCase();
  if (auto && auto !== 'no') return true;
  if (h['x-autoreply']) return true;
  if (/auto[_-]?reply/i.test(String(h.precedence || ''))) return true;
  const s = String(h.subject || '');
  return /^\s*(re:\s*)?(automatic(al)?\s+reply|auto(matic)?[-\s]?reply|autoreply|out\s+of\s+(the\s+)?office|away\s+from)/i.test(s)
      || /\bout of office\b/i.test(s);
};

/** Calendar invite chatter is not a human reply. */
const isInviteNoise = h =>
  /^(accepted|declined|tentative|invitation|updated invitation|cancelled event|canceled event):/i
    .test(String(h.subject || ''));

async function gmailList(t, q, max = 200) {
  const r = await req({ hostname: 'gmail.googleapis.com',
    path: `/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
    method: 'GET', headers: { Authorization: 'Bearer ' + t } });
  return r.s === 200 ? (JSON.parse(r.b).messages || []) : [];
}
async function gmailMeta(t, id) {
  const r = await req({ hostname: 'gmail.googleapis.com',
    path: `/gmail/v1/users/me/messages/${id}?format=metadata&${HEADERS}`,
    method: 'GET', headers: { Authorization: 'Bearer ' + t } });
  return r.s === 200 ? JSON.parse(r.b) : null;
}

async function main() {
  const c = await connect();
  const t = await token();

  const live = (await c.query(`
    select ct.id, ct.project_id, ct.full_name, lower(ct.email) email, ct.status,
           p.anchor_company,
           (select string_agg(distinct s.thread_id, ',') from market.step s
             where s.contact_id = ct.id and s.thread_id is not null) threads
      from market.contact ct join market.project p on p.id = ct.project_id
     where ct.status = 'active' and ct.email is not null`)).rows;

  if (!live.length) { console.log('no live market contacts'); await c.end(); return; }

  const byEmail = new Map(live.map(r => [r.email, r]));
  const byThread = new Map();
  live.forEach(r => String(r.threads || '').split(',').filter(Boolean)
    .forEach(th => { if (!byThread.has(th)) byThread.set(th, []); byThread.get(th).push(r); }));

  const replies = new Map(), oooes = new Map(), bulks = [], bounces = new Map();
  const seen = new Set();

  const classify = (row, m, h) => {
    const from = addrs(h.from)[0] || '';
    if (!from || isUs(from) || isRobot(from)) return;
    const key = row.id + ':' + m.id;
    if (seen.has(key)) return;
    seen.add(key);
    const rec = { row, from, subject: h.subject || '', ts: Number(m.internalDate), id: m.id, thread: m.threadId };
    if (isAutoReply(h)) { if (!oooes.has(row.id)) oooes.set(row.id, rec); return; }
    if (isBulk(h)) { bulks.push(rec); return; }
    if (isInviteNoise(h)) return;
    if (!replies.has(row.id) || replies.get(row.id).ts < rec.ts) replies.set(row.id, rec);
  };

  // Pass 1 - the threads we sent on.
  for (const [th, rows] of byThread) {
    const r = await req({ hostname: 'gmail.googleapis.com',
      path: `/gmail/v1/users/me/threads/${th}?format=metadata&${HEADERS}`,
      method: 'GET', headers: { Authorization: 'Bearer ' + t } });
    if (r.s !== 200) continue;
    const j = JSON.parse(r.b);
    for (const m of (j.messages || [])) for (const row of rows) classify(row, m, hdrs(m));
  }

  // Pass 2 - exact sender addresses, in chunks. Catches a reply that started a
  // new thread. Exact addresses only: never a domain.
  const emails = [...byEmail.keys()];
  for (let i = 0; i < emails.length; i += 20) {
    const group = emails.slice(i, i + 20);
    for (const stub of await gmailList(t, `from:{${group.join(' ')}} newer_than:${LOOKBACK}d`)) {
      const m = await gmailMeta(t, stub.id);
      if (!m) continue;
      const h = hdrs(m);
      const row = byEmail.get(addrs(h.from)[0] || '');
      if (row) classify(row, m, h);
    }
  }

  // Bounces - one sweep, matched by the address named inside the DSN.
  for (const stub of await gmailList(t, `from:(mailer-daemon OR postmaster) newer_than:${LOOKBACK}d`)) {
    const m = await gmailMeta(t, stub.id);
    if (!m) continue;
    const hay = ((m.snippet || '') + ' ' + (hdrs(m).subject || '')).toLowerCase();
    for (const [email, row] of byEmail) {
      if (hay.includes(email) && !bounces.has(row.id)) {
        bounces.set(row.id, { row, subject: hdrs(m).subject || '', ts: Number(m.internalDate) });
      }
    }
  }

  // Bookings - a Calendly invite is a win and often arrives with no reply email.
  const bookings = new Map();
  const tMin = new Date(Date.now() - 7 * 864e5).toISOString();
  const tMax = new Date(Date.now() + 120 * 864e5).toISOString();
  const cal = await req({ hostname: 'www.googleapis.com',
    path: `/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(tMin)}` +
          `&timeMax=${encodeURIComponent(tMax)}&singleEvents=true&maxResults=2500`,
    method: 'GET', headers: { Authorization: 'Bearer ' + t } });
  if (cal.s === 200) {
    for (const ev of (JSON.parse(cal.b).items || [])) {
      if (ev.status === 'cancelled') continue;
      for (const a of (ev.attendees || [])) {
        const row = byEmail.get(String(a.email || '').toLowerCase());
        if (row && !bookings.has(row.id)) {
          bookings.set(row.id, { row, title: ev.summary || '', when: (ev.start?.dateTime || ev.start?.date || '') });
        }
      }
    }
  } else {
    console.log('WARNING: calendar read failed (' + cal.s + '); bookings not checked this run');
  }

  if (httpFails()) {
    console.log('WARNING: ' + httpFails() + ' gmail requests failed after retries.');
    console.log('This sweep is INCOMPLETE. Not writing.');
    if (APPLY) { await c.end(); process.exit(2); }
  }

  // A bounce or a booking outranks a plain reply for the same contact.
  for (const id of bounces.keys()) replies.delete(id);
  for (const id of bookings.keys()) replies.delete(id);

  const d = ts => new Date(ts - 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  console.log('live market contacts checked: ' + live.length);
  console.log('\nreplies: ' + replies.size);
  for (const r of replies.values())
    console.log('  ' + d(r.ts) + '  ' + r.row.full_name.padEnd(22) + r.from.padEnd(32) + '"' + r.subject.slice(0, 44) + '"');
  console.log('\nbookings: ' + bookings.size);
  for (const b of bookings.values())
    console.log('  ' + String(b.when).slice(0, 16).padEnd(18) + b.row.full_name.padEnd(22) + '"' + b.title.slice(0, 44) + '"');
  console.log('\nbounces: ' + bounces.size);
  for (const b of bounces.values()) console.log('  ' + b.row.full_name.padEnd(22) + b.subject.slice(0, 60));
  console.log('\nout-of-office, cadence held and pushed +' + OOO_PUSH + 'd: ' + oooes.size);
  for (const o of oooes.values()) console.log('  ' + o.row.full_name.padEnd(22) + o.subject.slice(0, 60));
  if (bulks.length) console.log('\nbulk/newsletter ignored: ' + bulks.length);

  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  let ev = 0;
  const record = async (rec, kind) => {
    const r = await c.query(
      `insert into market.event (contact_id, project_id, direction, kind, sender_email, peer_email,
          thread_id, message_id, subject, sent_at)
       values ($1,$2,'in',$3,$4,$5,$6,$7,$8,$9) on conflict (message_id) do nothing returning id`,
      [rec.row.id, rec.row.project_id, kind, rec.from || null, ME, rec.thread || null,
       rec.id, rec.subject, new Date(rec.ts).toISOString()]);
    if (r.rows.length) ev++;
  };

  await c.query('begin');
  for (const rec of replies.values()) { await record(rec, 'reply');
    await c.query(`update market.contact set status='replied', ended_on=pt_today() where id=$1`, [rec.row.id]); }
  for (const rec of oooes.values()) { await record(rec, 'ooo'); }
  for (const rec of bulks) { await record(rec, 'bulk'); }
  for (const b of bounces.values())
    await c.query(`update market.contact set status='bounced', ended_on=pt_today() where id=$1`, [b.row.id]);
  for (const b of bookings.values())
    await c.query(`update market.contact set status='booked', ended_on=pt_today() where id=$1`, [b.row.id]);

  // Out-of-office holds the cadence rather than ending it. Pushed once only:
  // without the guard an auto-responder that fires on every follow-up would
  // walk the sequence forward forever and it would never finish.
  let pushed = 0;
  for (const o of oooes.values()) {
    if (replies.has(o.row.id) || bookings.has(o.row.id) || bounces.has(o.row.id)) continue;
    const r = await c.query(
      `update market.step set due_date = due_date + $2
         where contact_id = $1 and status = 'planned'
           and not exists (select 1 from market.event e
                            where e.contact_id = $1 and e.kind = 'ooo' and e.id <> 0
                              and e.observed_at < now() - interval '1 hour')`,
      [o.row.id, OOO_PUSH]);
    pushed += r.rowCount;
  }
  await c.query('commit');

  console.log(JSON.stringify({ inbound_events: ev, replied: replies.size, booked: bookings.size,
    bounced: bounces.size, steps_pushed_for_ooo: pushed }, null, 1));
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
