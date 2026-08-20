// Sweep the threads of every live sequence, record inbound mail, and stop the
// cadence for anyone who has written back. Updates Supabase AND followups.json
// so the scheduler and the database cannot drift apart.
//
//   node scripts/sync_replies.js            report only
//   node scripts/sync_replies.js --apply    write the changes
const fs = require('fs');
const path = require('path');
const https = require('https');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const ME = 'calvin@telescopepartners.com';
const APPLY = process.argv.includes('--apply');

function envv() {
  const e = {};
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
    .forEach(l => { const i = l.indexOf('='); if (i > 0) e[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return e;
}
function req(o, body, tries = 4) {
  return new Promise((res, rej) => {
    const a = n => { const r = https.request(o, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ s: x.statusCode, b: d })); });
      r.on('error', e => n > 0 ? setTimeout(() => a(n - 1), 700) : rej(e)); if (body) r.write(body); r.end(); };
    a(tries);
  });
}
async function token() {
  const e = envv();
  const b = new URLSearchParams({ client_id: e.GMAIL_CLIENT_ID, client_secret: e.GMAIL_CLIENT_SECRET,
    refresh_token: e.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
  const r = await req({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, b);
  if (r.s !== 200) throw new Error('token refresh failed');
  return JSON.parse(r.b).access_token;
}
const addrs = s => (String(s || '').match(/[\w.+-]+@[\w.-]+/g) || []).map(x => x.toLowerCase());

async function main() {
  const t = await token();
  const c = await connect();

  // Founders reply AFTER a cadence finishes at least as often as during it, so
  // 'completed' has to be in scope. Anything already marked replied/bounced or
  // last touched long ago is skipped to keep the sweep cheap.
  const live = await c.query(`
    select q.id seq_id, co.name company, ct.id contact_id, ct.email, co.id company_id, q.status,
           (select string_agg(distinct s.thread_id, ',') from step s
             where s.sequence_id = q.id and s.thread_id is not null) threads,
           (select string_agg(distinct lower(d.domain), ',') from company_domain d
             where d.company_id = co.id) domains
      from sequence q join company co on co.id = q.company_id join contact ct on ct.id = q.contact_id
     where q.status in ('active','needs_scheduling','completed')
       and coalesce((select max(s.sent_at)::date from step s where s.sequence_id = q.id),
                    pt_today()) > pt_today() - 45`);

  const HEADERS = ['From', 'Subject', 'Date', 'Auto-Submitted', 'X-Autoreply', 'Precedence']
    .map(h => 'metadataHeaders=' + h).join('&');

  /** Not a founder: us, a bounce daemon, or a notification robot. */
  const notAPerson = from =>
    /@telescopepartners\.com$/i.test(from) ||
    /mailer-daemon|postmaster|reminder@superhuman|calendar-notification|no-?reply/i.test(from);

  /**
   * An out-of-office is not a reply. This used to be true only by accident:
   * auto-replies usually land on their own thread, and the sweep only walked
   * the cadence thread, so it never saw them. Now that senders are matched by
   * domain across the mailbox they do show up, and they have to be excluded on
   * purpose. Checked against the headers a real autoresponder sets, with a
   * subject-line fallback for the ones that set nothing.
   */
  const isAutoReply = h => {
    const auto = String(h['auto-submitted'] || '').toLowerCase();
    if (auto && auto !== 'no') return true;
    if (h['x-autoreply']) return true;
    if (/auto[_-]?reply/i.test(String(h.precedence || ''))) return true;
    return /^\s*(re:\s*)?(automatic(al)?\s+reply|auto(matic)?[-\s]?reply|autoreply|out\s+of\s+(the\s+)?office|away\s+from\s+(my\s+)?(desk|email)|vacation\s+reply)\b/i
      .test(String(h.subject || '')) || /\bout of office\b/i.test(String(h.subject || ''));
  };

  // Free-mail and link-shortener domains would match half the mailbox if one
  // ever landed in company_domain, so they are never used for sender matching.
  const SHARED = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'me.com', 'aol.com', 'msn.com', 'live.com', 'proton.me', 'protonmail.com',
    'hubs.ly', 'bit.ly', 'substack.com']);

  const seqsByDomain = new Map();
  for (const row of live.rows) {
    for (const d of String(row.domains || '').split(',').filter(Boolean)) {
      if (SHARED.has(d)) continue;
      if (!seqsByDomain.has(d)) seqsByDomain.set(d, []);
      seqsByDomain.get(d).push(row);
    }
  }

  const found = [];
  const autos = [];
  const seenMsg = new Set();
  const hdrs = m => { const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value); return h; };
  const push = (row, m, h, threadId) => {
    const from = addrs(h.from)[0] || '';
    if (!from || notAPerson(from)) return;
    if (isAutoReply(h)) { autos.push({ company: row.company, from, subject: h.subject }); return; }
    const key = row.seq_id + ':' + m.id;
    if (seenMsg.has(key)) return;
    seenMsg.add(key);
    found.push({ ...row, message_id: m.id, thread_id: threadId, from,
      subject: h.subject || null, ts: Number(m.internalDate) });
  };

  // Pass 1: the cadence threads. Cheap, exact, and catches the common case.
  for (const row of live.rows) {
    for (const th of String(row.threads || '').split(',').filter(Boolean)) {
      const r = await req({ hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/threads/${th}?format=metadata&${HEADERS}`,
        method: 'GET', headers: { Authorization: 'Bearer ' + t } });
      if (r.s !== 200) continue;
      const j = JSON.parse(r.b);
      for (const m of (j.messages || [])) push(row, m, hdrs(m), j.id);
    }
  }

  // Pass 2: sender domain across the whole mailbox. A founder who replies from
  // a second address, or on a thread that started somewhere else such as
  // LinkedIn, is invisible to pass 1 no matter how many threads it walks.
  const domains = [...seqsByDomain.keys()];
  const CHUNK = 25;
  for (let i = 0; i < domains.length; i += CHUNK) {
    const group = domains.slice(i, i + CHUNK);
    const q = encodeURIComponent(`from:{${group.join(' ')}} newer_than:45d`);
    const r = await req({ hostname: 'gmail.googleapis.com',
      path: `/gmail/v1/users/me/messages?q=${q}&maxResults=200`,
      method: 'GET', headers: { Authorization: 'Bearer ' + t } });
    if (r.s !== 200) continue;
    for (const stub of (JSON.parse(r.b).messages || [])) {
      const mr = await req({ hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/messages/${stub.id}?format=metadata&${HEADERS}`,
        method: 'GET', headers: { Authorization: 'Bearer ' + t } });
      if (mr.s !== 200) continue;
      const m = JSON.parse(mr.b);
      const h = hdrs(m);
      const from = addrs(h.from)[0] || '';
      const dom = from.split('@')[1];
      for (const row of (seqsByDomain.get(dom) || [])) push(row, m, h, m.threadId);
    }
  }

  const bySeq = new Map();
  found.forEach(f => { if (!bySeq.has(f.seq_id) || bySeq.get(f.seq_id).ts < f.ts) bySeq.set(f.seq_id, f); });

  console.log('live sequences checked: ' + live.rows.length +
              '  (domains matched on: ' + seqsByDomain.size + ')');
  console.log('sequences with an inbound reply: ' + bySeq.size);
  for (const f of bySeq.values()) {
    const offThread = !String(f.threads || '').split(',').includes(f.thread_id);
    const offAddr = f.from.toLowerCase() !== String(f.email).toLowerCase();
    const how = [offThread ? 'other thread' : null, offAddr ? 'other address' : null]
      .filter(Boolean).join(', ');
    console.log('  ' + new Date(f.ts - 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') +
                ' | ' + f.company.padEnd(18) + ' | ' + f.from + (how ? '   <- ' + how : ''));
  }
  // Held, not counted. An out-of-office leaves the cadence live, so say so.
  if (autos.length) {
    console.log('\nauto-replies held (cadence left live): ' + autos.length);
    const seenAuto = new Set();
    for (const a of autos) {
      if (seenAuto.has(a.company)) continue;
      seenAuto.add(a.company);
      console.log('  ' + a.company.padEnd(18) + ' | ' + a.from + ' | ' + String(a.subject || '').slice(0, 50));
    }
  }
  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  let ev = 0;
  for (const f of found) {
    const r = await c.query(
      `insert into email_event (contact_id, company_id, direction, sender_email, peer_email,
                                thread_id, message_id, subject, sent_at, source)
       values ($1,$2,'in',$3,$4,$5,$6,$7,$8,'gmail') on conflict (message_id) do nothing returning id`,
      [f.contact_id, f.company_id, f.from, f.email, f.thread_id, f.message_id, f.subject,
       new Date(f.ts).toISOString()]);
    if (r.rows.length) ev++;
  }
  for (const seqId of bySeq.keys()) {
    await c.query(`update step set status='cancelled' where sequence_id=$1 and status='planned'`, [seqId]);
    // pt_today(), not current_date: the server runs UTC, so after 5pm Pacific
    // current_date is already tomorrow and stamps a sequence as ending on a day
    // that has not happened yet.
    await c.query(`update sequence set status='replied', ended_on=pt_today() where id=$1`, [seqId]);
  }

  // stop the same cadences in the file the scheduler actually reads
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'followups.json'), 'utf8'));
  const emails = new Set([...bySeq.values()].map(f => f.email.toLowerCase()));
  let stopped = 0;
  cfg.pending.forEach(e => {
    if (e.status === 'pending' && emails.has(String(e.email).toLowerCase())) {
      e.status = 'replied'; e.processedAt = new Date().toISOString(); stopped++;
    }
  });
  fs.writeFileSync(path.join(ROOT, 'followups.json'), JSON.stringify(cfg, null, 2));

  console.log(JSON.stringify({ inbound_events_inserted: ev, sequences_marked_replied: bySeq.size,
    followups_entries_stopped: stopped }, null, 1));
  await c.end();
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
