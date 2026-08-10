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
             where s.sequence_id = q.id and s.thread_id is not null) threads
      from sequence q join company co on co.id = q.company_id join contact ct on ct.id = q.contact_id
     where q.status in ('active','needs_scheduling','completed')
       and coalesce((select max(s.sent_at)::date from step s where s.sequence_id = q.id),
                    current_date) > current_date - 45`);

  const found = [];
  for (const row of live.rows) {
    for (const th of String(row.threads || '').split(',').filter(Boolean)) {
      const r = await req({ hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/threads/${th}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        method: 'GET', headers: { Authorization: 'Bearer ' + t } });
      if (r.s !== 200) continue;
      const j = JSON.parse(r.b);
      for (const m of (j.messages || [])) {
        const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value);
        const from = addrs(h.from)[0] || '';
        if (!from) continue;
        // Anyone @telescopepartners is us. Chris and Claire are cc'd on plenty
        // of these threads and their replies are not founder replies.
        if (/@telescopepartners\.com$/i.test(from)) continue;
        if (/mailer-daemon|postmaster|reminder@superhuman|calendar-notification/i.test(from)) continue;
        found.push({ ...row, message_id: m.id, thread_id: j.id, from,
          subject: h.subject || null, ts: Number(m.internalDate) });
      }
    }
  }

  const bySeq = new Map();
  found.forEach(f => { if (!bySeq.has(f.seq_id) || bySeq.get(f.seq_id).ts < f.ts) bySeq.set(f.seq_id, f); });

  console.log('live sequences checked: ' + live.rows.length);
  console.log('sequences with an inbound reply: ' + bySeq.size);
  for (const f of bySeq.values()) {
    console.log('  ' + new Date(f.ts - 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') +
                ' | ' + f.company.padEnd(18) + ' | ' + f.from);
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
    await c.query(`update sequence set status='replied', ended_on=current_date where id=$1`, [seqId]);
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
