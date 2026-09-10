// Reconcile outreach Calvin sent by hand, outside the cadence engine, into
// email_event so the analytics views stop under-counting him.
//
// Why this exists: mark_sent.js only recognises a send that lands on a known
// cadence thread, because that is how it maps a message to a step. A campaign
// Calvin sends himself (the NY/LA coffee round, a one-off intro) opens a NEW
// thread, so mark_sent is structurally blind to it and email_event ends up with
// zero outbound rows for the week. This script closes that gap without touching
// sequences: it records the observed mail and, for a company we have never
// contacted, creates the company/contact rows so the events are attributable.
//
// It deliberately does NOT open a sequence. These sends are not cadences and
// inventing steps for them would put mail in the due queue that Calvin never
// planned to send.
//
//   node scripts/reconcile_direct_sends.js                 report only
//   node scripts/reconcile_direct_sends.js --apply          write it
//   node scripts/reconcile_direct_sends.js --since=2026-09-08
const fs = require('fs');
const path = require('path');
const https = require('https');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const ME = 'calvin@telescopepartners.com';
const APPLY = process.argv.includes('--apply');
const SINCE = (process.argv.find(a => a.startsWith('--since=')) || '--since=2026-09-08').split('=')[1];
// Companies already in the tracker are unambiguous. A net-new address may be a
// founder, an expert or a robot, so it is held back until asked for.
const KNOWN_ONLY = process.argv.includes('--known-only');

function envv() {
  const e = {};
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
    .forEach(l => { const i = l.indexOf('='); if (i > 0) e[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return e;
}

// Same retry contract as the other reconcile scripts: Gmail throttles bursts
// with 429, and a throttled request read as "nothing there" is how a partial
// sweep gets mistaken for a clean one.
let HTTP_FAILS = 0;
const httpFails = () => HTTP_FAILS;
function req(o, body, tries = 6) {
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  return new Promise((res, rej) => {
    const a = n => {
      const r = https.request(o, x => {
        let d = ''; x.on('data', c => d += c);
        x.on('end', () => {
          if (RETRYABLE.has(x.statusCode) && n > 0)
            return setTimeout(() => a(n - 1), (tries - n + 1) * 1500 + Math.random() * 600);
          if (x.statusCode !== 200 && x.statusCode !== 204) HTTP_FAILS++;
          res({ s: x.statusCode, b: d });
        });
      });
      r.on('error', e => n > 0 ? setTimeout(() => a(n - 1), 700) : rej(e));
      if (body) r.write(body); r.end();
    };
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

// Not a founder we are prospecting. Telescope's own people, robots, and the
// free-mail domains that would otherwise become a "company".
const INTERNAL = /@telescopepartners\.com$/i;
const ROBOT = /mailer-daemon|postmaster|no-?reply|noreply|@superhuman\.com$|calendar-notification|@resource\.calendar/i;
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'me.com', 'aol.com', 'msn.com', 'live.com', 'proton.me', 'protonmail.com']);
// Investors, and the research firms and consultancies Calvin cold-emails for
// market diligence via the marketoutreach skill. Both are real correspondents
// and neither is a portfolio prospect, so they are surfaced for review but
// never recorded as a company: expert outreach has its own tracker.
const NOT_A_PROSPECT = /\.vc$|\.vc\b|ventures?\.|capital\.|\.capital$|partners\.com$|bmwiventures|alphasights|limra\.com$|datos-insights\.com$|capgemini\.com$|deloitte|accenture|mckinsey|gartner|forrester/i;

// A campaign subject is outreach. An intro thread, a project thread or an
// internal update is not, and folding those into outreach analytics would
// quietly inflate the denominator.
const OUTREACH_SUBJECT = s => {
  const t = String(s || '').replace(/^re:\s*/i, '').trim();
  if (/^(introduction|connecting|intro):/i.test(t)) return false;
  if (/^(new project|project updates)/i.test(t)) return false;
  if (/^alphasights call|^invitation:/i.test(t)) return false;
  // Expert-call outreach uses its own subject line and its own tracker.
  if (/\bchat on\b.*\b(software|tools|market)\b/i.test(t)) return false;
  return /^coffee in /i.test(t)
      || /^telescope ?(<>|&lt;&gt;) /i.test(t)
      || /^telescope intro \(sequoia spinout\)/i.test(t)   // the Round 2 subject
      || /\|\s*telescope partners\s*$/i.test(t)            // "Meet up at IMTS? | Telescope Partners"
      || /^telescope partners \|/i.test(t);
};

async function main() {
  const t = await token();
  const c = await connect();

  // Every thread Calvin sent on since SINCE. Walking whole threads, not just
  // the sent messages, so a reply that came back on the same thread is caught
  // in the same pass.
  let ids = [], pageToken = null;
  do {
    const q = encodeURIComponent(`from:me in:sent after:${SINCE.replace(/-/g, '/')}`);
    const r = await req({ hostname: 'gmail.googleapis.com',
      path: `/gmail/v1/users/me/messages?q=${q}&maxResults=200` + (pageToken ? `&pageToken=${pageToken}` : ''),
      method: 'GET', headers: { Authorization: 'Bearer ' + t } });
    if (r.s !== 200) break;
    const j = JSON.parse(r.b);
    ids.push(...(j.messages || []).map(m => m.id));
    pageToken = j.nextPageToken || null;
  } while (pageToken);

  // resolve to distinct threads, then walk each thread once
  const threadIds = new Set();
  let i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      const r = await req({ hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=To`,
        method: 'GET', headers: { Authorization: 'Bearer ' + t } });
      if (r.s === 200) threadIds.add(JSON.parse(r.b).threadId);
    }
  }));

  const msgs = [];
  const tl = [...threadIds]; let k = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (k < tl.length) {
      const th = tl[k++];
      const r = await req({ hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/threads/${th}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        method: 'GET', headers: { Authorization: 'Bearer ' + t } });
      if (r.s !== 200) continue;
      const j = JSON.parse(r.b);
      for (const m of (j.messages || [])) {
        const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value);
        const from = addrs(h.from)[0] || '';
        const isOut = from === ME;
        const peer = isOut ? addrs(h.to).find(a => !INTERNAL.test(a)) : from;
        if (!peer || INTERNAL.test(peer) || ROBOT.test(peer)) continue;
        msgs.push({ id: m.id, threadId: j.id, direction: isOut ? 'out' : 'in',
          from, peer, subject: h.subject || null, ts: Number(m.internalDate) });
      }
    }
  }));

  if (httpFails()) {
    console.log('WARNING: ' + httpFails() + ' gmail requests failed after retries.');
    console.log('This sweep is INCOMPLETE. Not writing.');
    if (APPLY) { await c.end(); process.exit(2); }
  }

  // Only keep threads whose subject marks them as outreach.
  const outreach = msgs.filter(m => OUTREACH_SUBJECT(m.subject));
  const skippedSubjects = [...new Set(msgs.filter(m => !OUTREACH_SUBJECT(m.subject))
    .map(m => String(m.subject || '').replace(/^re:\s*/i, '').trim()))];

  // Classify each peer against what the tracker already knows.
  const peers = [...new Set(outreach.map(m => m.peer))];
  const byContact = new Map((await c.query(
    `select lower(ct.email) email, ct.id contact_id, ct.company_id, co.name company
       from contact ct join company co on co.id = ct.company_id
      where lower(ct.email) = any($1::text[])`, [peers])).rows.map(r => [r.email, r]));
  const doms = [...new Set(peers.map(p => p.split('@')[1]).filter(d => d && !FREEMAIL.has(d)))];
  const byDomain = new Map((await c.query(
    `select lower(d.domain) domain, co.id company_id, co.name company
       from company_domain d join company co on co.id = d.company_id
      where lower(d.domain) = any($1::text[])
     union
     select lower(co.primary_domain), co.id, co.name from company co
      where lower(co.primary_domain) = any($1::text[])`, [doms])).rows.map(r => [r.domain, r]));

  const groups = { known_contact: [], known_company: [], not_a_prospect: [], net_new: [] };
  for (const p of peers) {
    const dom = p.split('@')[1];
    const ct = byContact.get(p);
    const co = byDomain.get(dom);
    const rec = { peer: p, dom, contact_id: ct?.contact_id ?? null,
      company_id: ct?.company_id ?? co?.company_id ?? null,
      company: ct?.company ?? co?.company ?? null,
      msgs: outreach.filter(m => m.peer === p) };
    if (ct) groups.known_contact.push(rec);
    else if (co) groups.known_company.push(rec);
    else if (NOT_A_PROSPECT.test(p) || FREEMAIL.has(dom)) groups.not_a_prospect.push(rec);
    else groups.net_new.push(rec);
  }

  const nOut = g => g.reduce((a, r) => a + r.msgs.filter(m => m.direction === 'out').length, 0);
  const nIn = g => g.reduce((a, r) => a + r.msgs.filter(m => m.direction === 'in').length, 0);

  console.log(`direct sends since ${SINCE}: ${ids.length} messages across ${threadIds.size} threads`);
  console.log(`of those, outreach-subject messages: ${outreach.length} to ${peers.length} people\n`);

  const dump = (label, g) => {
    console.log(`=== ${label}: ${g.length} people, ${nOut(g)} out / ${nIn(g)} in ===`);
    g.sort((a, b) => a.peer.localeCompare(b.peer)).forEach(r => console.log(
      `  ${r.peer.padEnd(34)} ${String(r.company || '-').padEnd(18)} ` +
      `${r.msgs.filter(m => m.direction === 'out').length}o/${r.msgs.filter(m => m.direction === 'in').length}i`));
    if (!g.length) console.log('  (none)');
    console.log('');
  };
  dump('ALREADY OUTREACHED - contact on file', groups.known_contact);
  dump('ALREADY OUTREACHED - company on file, new contact', groups.known_company);
  dump('NET NEW - not in the tracker at all', groups.net_new);
  dump('NOT A PROSPECT - investor / service firm / freemail, skipped', groups.not_a_prospect);

  if (skippedSubjects.length) {
    console.log('non-outreach threads skipped by subject:');
    skippedSubjects.slice(0, 15).forEach(s => console.log('  ' + s.slice(0, 66)));
    console.log('');
  }

  const willWrite = KNOWN_ONLY
    ? [...groups.known_contact, ...groups.known_company]
    : [...groups.known_contact, ...groups.known_company, ...groups.net_new];
  if (KNOWN_ONLY) console.log('--known-only: holding back the ' + groups.net_new.length + ' net-new addresses');
  console.log(`would record ${nOut(willWrite)} outbound and ${nIn(willWrite)} inbound email_event rows`);
  console.log(`would create ${willWrite.filter(r => !r.company_id).length} company + contact rows (NO sequences)`);

  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  let companies = 0, contacts = 0, ev = 0;
  await c.query('begin');
  try {
    for (const r of willWrite) {
      // A net-new company gets company + contact so its events are
      // attributable, but no sequence: this was not a cadence.
      if (!r.company_id) {
        const name = r.dom.replace(/\.(ai|com|io|co|inc|so|net|dev|app|xyz|health|security|market|eu)$/i, '')
          .split('.').slice(-1)[0].replace(/[-_]/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
        const co = await c.query(
          `insert into company (name, primary_domain, status, note)
           values ($1,$2,'prospect',$3)
           on conflict (primary_domain) do update set primary_domain = excluded.primary_domain
           returning id`, [name, r.dom, `direct outreach ${SINCE}, no cadence opened`]);
        r.company_id = co.rows[0].id; companies++;
        await c.query(`insert into company_domain (domain, company_id) values ($1,$2)
                       on conflict (domain) do nothing`, [r.dom, r.company_id]);
      }
      if (!r.contact_id) {
        const ct = await c.query(
          `insert into contact (company_id, email, is_primary) values ($1,$2,true)
           on conflict (email) do update set email = excluded.email returning id`,
          [r.company_id, r.peer]);
        r.contact_id = ct.rows[0].id; contacts++;
      }
      for (const m of r.msgs) {
        const e = await c.query(
          `insert into email_event (contact_id, company_id, direction, sender_email, peer_email,
                                    thread_id, message_id, subject, sent_at, source)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'gmail')
           on conflict (message_id) do nothing returning id`,
          [r.contact_id, r.company_id, m.direction, m.direction === 'out' ? ME : m.peer,
           r.peer, m.threadId, m.id, m.subject, new Date(m.ts).toISOString()]);
        if (e.rows.length) ev++;
      }
    }
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  }

  console.log(JSON.stringify({ companies_created: companies, contacts_created: contacts,
    email_events_inserted: ev, sequences_opened: 0 }, null, 1));
  await c.end();
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
