// Reconcile step status from Gmail. A step is 'sent' when the message actually
// left the mailbox, not when a draft was created, so the mailbox decides.
//
// Matching rule: within a sequence's thread, the Nth outbound message from
// Calvin is step N. That holds for both engines because a restart opens its own
// thread, and it survives Calvin sending by hand instead of from a draft.
//
//   node scripts/mark_sent.js            report only
//   node scripts/mark_sent.js --apply    write the changes
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

  // Every step that the database still believes has not gone out, on any
  // sequence that is not already finished by a reply or a bounce.
  const open = await c.query(`
    select q.id seq_id, co.name company, co.id company_id, ct.id contact_id, ct.email,
           s.id step_id, s.step_no, s.status, s.due_date::text due,
           coalesce(s.thread_id, (select s2.thread_id from step s2
              where s2.sequence_id = q.id and s2.thread_id is not null
              order by s2.step_no limit 1)) thread_id
      from step s
      join sequence q on q.id = s.sequence_id
      join company co on co.id = q.company_id
      join contact ct on ct.id = q.contact_id
     where s.status in ('planned','drafted')
       and q.status in ('active','needs_scheduling','completed')
       and s.due_date <= current_date
     order by co.name, s.step_no`);

  // one Gmail fetch per thread, not per step
  const threads = [...new Set(open.rows.map(r => r.thread_id).filter(Boolean))];
  const out = new Map();
  for (const th of threads) {
    const r = await req({ hostname: 'gmail.googleapis.com',
      path: `/gmail/v1/users/me/threads/${th}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      method: 'GET', headers: { Authorization: 'Bearer ' + t } });
    if (r.s !== 200) { out.set(th, null); continue; }
    const j = JSON.parse(r.b);
    const mine = (j.messages || []).filter(m => {
      const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value);
      return (addrs(h.from)[0] || '') === ME;
    }).map(m => {
      const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value);
      return { id: m.id, ts: Number(m.internalDate), subject: h.subject || null };
    }).sort((a, b) => a.ts - b.ts);
    out.set(th, mine);
  }

  const hits = [], missing = [];
  for (const r of open.rows) {
    const mine = r.thread_id ? out.get(r.thread_id) : null;
    if (!mine || mine.length < r.step_no) { missing.push(r); continue; }
    hits.push({ ...r, msg: mine[r.step_no - 1] });
  }

  console.log('open steps due on or before today: ' + open.rows.length);
  console.log('confirmed sent in gmail: ' + hits.length);
  hits.forEach(h => console.log('  SENT    ' + new Date(h.msg.ts - 7 * 3600e3).toISOString().slice(0, 10) +
    ' | E' + h.step_no + ' ' + h.company));
  console.log('still genuinely unsent: ' + missing.length);
  missing.forEach(m => console.log('  UNSENT  due ' + m.due + ' | E' + m.step_no + ' ' + m.company +
    (m.status === 'drafted' ? ' (draft waiting)' : '')));

  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  let ev = 0;
  for (const h of hits) {
    await c.query(`update step set status='sent', sent_at=$2, thread_id=coalesce(thread_id,$3)
                    where id=$1`, [h.step_id, new Date(h.msg.ts).toISOString(), h.thread_id]);
    const e = await c.query(
      `insert into email_event (contact_id, company_id, direction, sender_email, peer_email,
                               thread_id, message_id, subject, sent_at, source)
       values ($1,$2,'out',$3,$4,$5,$6,$7,$8,'gmail') on conflict (message_id) do nothing returning id`,
      [h.contact_id, h.company_id, ME, h.email, h.thread_id, h.msg.id, h.msg.subject,
       new Date(h.msg.ts).toISOString()]);
    if (e.rows.length) ev++;
  }

  // A step that just went out drags its successors with it. Without this the
  // next email carries a due date that is already in the past and fires the
  // same day, which collapses the cadence.
  const GAP = { first: { 2: 2, 3: 5, 4: 5 }, restart: { 2: 2, 3: 3, 4: 5 } };
  const moved = [];
  for (const h of hits) {
    const kind = (await c.query(`select kind from sequence where id=$1`, [h.seq_id])).rows[0].kind;
    const sentOn = new Date(h.msg.ts).toISOString().slice(0, 10);
    const nxt = h.step_no + 1;
    if (nxt > 4) continue;
    const gap = GAP[kind][nxt];
    const due = new Date(Date.parse(sentOn + 'T12:00:00Z') + gap * 864e5).toISOString().slice(0, 10);
    const r = await c.query(
      `update step set due_date=$3 where sequence_id=$1 and step_no=$2
         and status='planned' and due_date <= $4 returning id`,
      [h.seq_id, nxt, due, sentOn]);
    if (r.rows.length) moved.push(`${h.company} E${nxt} -> ${due}`);
  }
  if (moved.length) { console.log('re-anchored:'); moved.forEach(m => console.log('  ' + m)); }

  // a sequence whose four steps have all gone out is done
  const done = await c.query(`
    update sequence q set status='completed', ended_on=(select max(s.sent_at)::date from step s where s.sequence_id=q.id)
     where q.status='active'
       and not exists (select 1 from step s where s.sequence_id=q.id and s.status in ('planned','drafted'))
       and (select count(*) from step s where s.sequence_id=q.id and s.status='sent') = 4
     returning q.id`);

  // keep the file the scheduler reads in step with the database
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'followups.json'), 'utf8'));
  const key = new Set(hits.map(h => String(h.email).toLowerCase() + '#' + h.step_no));
  let closed = 0;
  cfg.pending.forEach(e => {
    if (e.status === 'pending' && key.has(String(e.email).toLowerCase() + '#' + e.emailNumber)) {
      e.status = 'sent'; e.processedAt = new Date().toISOString(); closed++;
    }
  });
  fs.writeFileSync(path.join(ROOT, 'followups.json'), JSON.stringify(cfg, null, 2));

  console.log(JSON.stringify({ steps_marked_sent: hits.length, outbound_events_inserted: ev,
    sequences_completed: done.rows.length, followups_entries_closed: closed }, null, 1));
  await c.end();
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
