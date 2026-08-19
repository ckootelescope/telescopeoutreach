// Find outreach that was sent but never became a cadence.
//
//   node scripts/os_orphan_check.js [--days=21] [--apply]
//
// The gap this closes: an opener only counts once a sequence exists. Sending
// happens in Superhuman, and new_cadence.js creates the sequence afterwards. Skip
// that second step and the send is invisible to the tracker forever, because
// mark_sent.js reconciles steps that already exist and there are none.
//
// So this works the other way round: start from the mailbox, and flag anything
// that looks like outreach and has no sequence behind it.
//
// Run it after mark_sent.js in the daily routine. Report only by default.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { connect } = require('./db');

const ME = 'calvin@telescopepartners.com';
const INTERNAL = /@(telescopepartners\.com|alphasights\.com|tegus\.com|optima-partners\.com)$/i;

// Openers all carry the fund name, whatever the rest of the subject says:
// "Telescope <> X Intro", "Telescope Intro (Sequoia Spinout)", "... | Telescope
// Partners Intro". Anchoring on that is far more reliable than a fixed pattern.
const QUERY = (d) => `from:me in:sent subject:Telescope newer_than:${d}d`;

function env() {
  const e = {};
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .split(/\r?\n/).forEach(l => { const i = l.indexOf('='); if (i > 0) e[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return e;
}

function req(o, body, tries = 4) {
  return new Promise((res, rej) => {
    const attempt = n => {
      const r = https.request(o, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ s: x.statusCode, b: d })); });
      r.on('error', e => n > 0 ? setTimeout(() => attempt(n - 1), 700) : rej(e));
      if (body) r.write(body); r.end();
    };
    attempt(tries);
  });
}

async function token() {
  const e = env();
  const body = new URLSearchParams({
    client_id: e.GMAIL_CLIENT_ID, client_secret: e.GMAIL_CLIENT_SECRET,
    refresh_token: e.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token',
  }).toString();
  const r = await req({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, body);
  if (r.s !== 200) throw new Error('token refresh failed: ' + r.b.slice(0, 160));
  return JSON.parse(r.b).access_token;
}

const get = async (t, p) => {
  const r = await req({ hostname: 'gmail.googleapis.com', path: p, method: 'GET',
    headers: { Authorization: 'Bearer ' + t } });
  if (r.s !== 200) throw new Error(`gmail ${r.s}: ${r.b.slice(0, 160)}`);
  return JSON.parse(r.b);
};

const header = (h, n) => (h.find(x => x.name.toLowerCase() === n.toLowerCase()) || {}).value || '';
const addrs = s => (String(s || '').match(/[\w.+-]+@[\w.-]+/g) || []).map(x => x.toLowerCase());

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const days = Number((args.find(a => a.startsWith('--days=')) || '--days=21').split('=')[1]) || 21;

  const t = await token();
  const c = await connect();

  const list = await get(t, `/gmail/v1/users/me/messages?q=${encodeURIComponent(QUERY(days))}&maxResults=200`);
  const ids = (list.messages || []).map(m => m.id);

  const seen = new Set();
  const found = [];

  for (const id of ids) {
    const m = await get(t, `/gmail/v1/users/me/messages/${id}?format=metadata` +
      '&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date');
    const h = m.payload?.headers || [];
    const to = addrs(header(h, 'to')).filter(a => a !== ME && !INTERNAL.test(a));
    if (!to.length) continue;

    const peer = to[0];
    const domain = peer.split('@')[1];
    if (seen.has(domain)) continue;
    seen.add(domain);

    // A reply is not an opener. Cadences start a thread, so anything already in
    // one is a conversation, not a missing sequence.
    const subject = header(h, 'Subject');
    if (/^re:/i.test(subject.trim())) continue;

    // Three reasons a Telescope send legitimately has no cadence behind it: a
    // sequence already exists, the recipient is an investor rather than a
    // founder, or they replied (the database refuses to cadence a responder).
    const ok = await c.query(
      `select
         exists (select 1 from sequence q
                   join company_domain cd on cd.company_id = q.company_id
                  where cd.domain = $1)                                  as has_seq,
         exists (select 1 from os_investor where domain = $1)
         or exists (select 1 from os_investor_target
                     where split_part(coalesce(email, ''), '@', 2) = $1) as is_investor,
         exists (select 1 from email_event e
                   join company_domain cd on cd.company_id = e.company_id
                  where cd.domain = $1 and e.direction = 'in')           as replied`,
      [domain]);
    const r = ok.rows[0];
    if (r.has_seq || r.is_investor || r.replied) continue;

    found.push({
      thread_id: m.threadId, message_id: m.id, peer_email: peer, peer_domain: domain,
      subject, sent_at: new Date(Number(m.internalDate)).toISOString(),
    });
  }

  found.sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1));

  if (!found.length) {
    console.log(`No orphans. Every Telescope send in the last ${days} days has a cadence behind it.`);
  } else {
    console.log(`${found.length} sent with no cadence behind them:\n`);
    for (const f of found) {
      const age = Math.round((Date.now() - Date.parse(f.sent_at)) / 864e5);
      console.log(`  ${f.sent_at.slice(0, 10)}  ${String(age).padStart(2)}d  ${f.peer_domain.padEnd(24)}${f.subject.slice(0, 52)}`);
    }
    console.log('\nEach needs node scripts/new_cadence.js with the opener body, or mark it ignored.');
  }

  if (apply) {
    for (const f of found) {
      await c.query(
        `insert into os_orphan_send (thread_id, message_id, peer_email, peer_domain, subject, sent_at)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (thread_id) do update set sent_at = excluded.sent_at`,
        [f.thread_id, f.message_id, f.peer_email, f.peer_domain, f.subject, f.sent_at]);
    }
    console.log(`\nrecorded ${found.length}.`);
  } else {
    console.log('\nreport only. re-run with --apply to record them.');
  }

  await c.end();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
