// Thread-centric Gmail sweep.
// Pulls every thread the DB already knows about and records each message as an
// observed event. Targeted rather than crawling the whole mailbox.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { connect } = require('./db');

const ME = 'calvin@telescopepartners.com';
const CONCURRENCY = 8;

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
  const body = new URLSearchParams({ client_id: e.GMAIL_CLIENT_ID, client_secret: e.GMAIL_CLIENT_SECRET,
    refresh_token: e.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
  const r = await req({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, body);
  if (r.s !== 200) throw new Error('token refresh failed: ' + r.b.slice(0, 200));
  return JSON.parse(r.b).access_token;
}

const addrs = s => (String(s || '').match(/[\w.+-]+@[\w.-]+/g) || []).map(x => x.toLowerCase());

async function main() {
  const t = await token();
  const c = await connect();
  const r = await c.query(`
    select distinct thread_id from (
      select thread_id from step where thread_id is not null
      union select thread_id from email_event where thread_id is not null
    ) z where thread_id <> ''`);
  await c.end();

  const ids = r.rows.map(x => x.thread_id);
  console.error('threads to fetch: ' + ids.length);

  const out = [];
  let done = 0, missing = 0;
  async function worker(queue) {
    while (queue.length) {
      const id = queue.pop();
      const resp = await req({ hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Subject`,
        method: 'GET', headers: { Authorization: 'Bearer ' + t } });
      done++;
      if (done % 50 === 0) console.error('  ' + done + '/' + ids.length);
      if (resp.s !== 200) { missing++; continue; }
      const j = JSON.parse(resp.b);
      for (const m of (j.messages || [])) {
        const h = {}; (m.payload?.headers || []).forEach(x => h[x.name.toLowerCase()] = x.value);
        const from = addrs(h.from)[0] || '';
        const isOut = from === ME;
        const peers = isOut ? addrs(h.to).filter(a => a !== ME) : [from];
        const peer = peers[0];
        if (!peer || peer === ME) continue;
        out.push({ id: m.id, threadId: j.id, direction: isOut ? 'out' : 'in',
          from, peer, subject: h.subject || null, ts: Number(m.internalDate) });
      }
    }
  }
  const queue = ids.slice();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  fs.writeFileSync(path.join(__dirname, '..', '_mail_sweep.json'), JSON.stringify(out));
  console.log(JSON.stringify({ threads: ids.length, threads_missing: missing, messages: out.length,
    outbound: out.filter(x => x.direction === 'out').length,
    inbound: out.filter(x => x.direction === 'in').length }, null, 1));
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
