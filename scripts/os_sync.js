// Weekly OS <-> Google sync.
//
//   node scripts/os_sync.js --calendar [--weeks=2]     pull events  (read only)
//   node scripts/os_sync.js --tasks [--apply]          push to Google Tasks
//   node scripts/os_sync.js                            report both sides
//
// Two directions, deliberately asymmetric:
//
//   Calendar is READ ONLY. Calvin's calls are the fixed frame the week is planned
//   around; the OS never writes an event.
//
//   To-dos go out as Google TASKS, not events, so Calvin can filter tasks apart
//   from real meetings in Google Calendar. A task carries a due date and no time,
//   which is what keeps it out of the event lane.
//
// Both need scopes the original Gmail token does not have. If either fails with
// insufficient scope, run `node scripts/reauth_google.js` and click Allow.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { connect } = require('./db');

const CAL = 'primary';
const TASKLIST = '@default';

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

function scopeHint(r, what) {
  if (r.s === 403 && /insufficient|scope/i.test(r.b)) {
    return `${what}: the token lacks the required scope.\n`
      + '  Fix: node scripts/reauth_google.js  (then click Allow)';
  }
  return `${what}: HTTP ${r.s} ${r.b.slice(0, 220)}`;
}

/** The Monday of the Pacific week containing `d`. */
function monday(d = new Date()) {
  const pt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pt.setHours(0, 0, 0, 0);
  pt.setDate(pt.getDate() - ((pt.getDay() + 6) % 7));
  return pt;
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Pacific calendar date of an instant. Events land on the day Calvin sees. */
const ptDay = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

// ---------------------------------------------------------------------------

async function pullCalendar(weeks, c) {
  const t = await token();
  const from = monday();
  const to = new Date(from); to.setDate(to.getDate() + weeks * 7);

  const qs = new URLSearchParams({
    timeMin: new Date(from).toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  }).toString();

  const r = await req({
    hostname: 'www.googleapis.com',
    path: `/calendar/v3/calendars/${encodeURIComponent(CAL)}/events?${qs}`,
    method: 'GET', headers: { Authorization: 'Bearer ' + t },
  });
  if (r.s !== 200) throw new Error(scopeHint(r, 'calendar read'));

  const items = (JSON.parse(r.b).items || []).filter(e => e.status !== 'cancelled');
  let n = 0;
  for (const e of items) {
    const allDay = !e.start?.dateTime;
    const startsAt = e.start?.dateTime || (e.start?.date ? e.start.date + 'T00:00:00-07:00' : null);
    if (!startsAt) continue;
    await c.query(`
      insert into os_calendar_event
        (external_id, summary, starts_at, ends_at, day, all_day, location, attendees, synced_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8, now())
      on conflict (external_id) do update set
        summary = excluded.summary, starts_at = excluded.starts_at,
        ends_at = excluded.ends_at, day = excluded.day, all_day = excluded.all_day,
        location = excluded.location, attendees = excluded.attendees, synced_at = now()`,
      [e.id, e.summary || '(no title)', startsAt, e.end?.dateTime || e.end?.date || null,
       allDay ? e.start.date : ptDay(startsAt), allDay, e.location || null,
       (e.attendees || []).map(a => a.email).filter(Boolean)]);
    n++;
  }
  console.log(`calendar: ${n} events synced, ${iso(from)} to ${iso(to)}`);
}

// ---------------------------------------------------------------------------

async function pushTasks(apply, c) {
  const { rows } = await c.query(`
    select t.id, t.title, t.day, t.due_on, t.stream, t.gtask_id,
           coalesce(t.subject_label, co.name, m.name) as subject
      from os_task t
      left join company co on co.id = t.company_id
      left join os_market m on m.id = t.market_id
     where t.status = 'open'
       and coalesce(t.day, t.due_on) is not null
       and t.gtask_id is null
     order by coalesce(t.day, t.due_on), t.sort`);

  if (!rows.length) { console.log('tasks: nothing new to push'); return; }

  console.log(`tasks: ${rows.length} to push` + (apply ? '' : '  (report only, pass --apply)'));
  for (const r of rows) {
    const due = r.day || r.due_on;
    const title = r.subject ? `${r.subject}: ${r.title}` : r.title;
    console.log(`  ${due}  [${r.stream}]  ${title}`);
  }
  if (!apply) return;

  const t = await token();
  let n = 0;
  for (const r of rows) {
    const due = r.day || r.due_on;
    const title = r.subject ? `${r.subject}: ${r.title}` : r.title;
    // Google Tasks takes an RFC3339 instant but ignores the time part and
    // renders a date-only task, which is what keeps it out of the event lane.
    const body = JSON.stringify({ title, due: `${due}T00:00:00.000Z`, notes: `stream: ${r.stream}` });
    const res = await req({
      hostname: 'tasks.googleapis.com',
      path: `/tasks/v1/lists/${encodeURIComponent(TASKLIST)}/tasks`,
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(body) },
    }, body);
    if (res.s !== 200 && res.s !== 201) throw new Error(scopeHint(res, 'tasks write'));
    await c.query('update os_task set gtask_id = $1, gtask_synced_at = now() where id = $2',
      [JSON.parse(res.b).id, r.id]);
    n++;
  }
  console.log(`tasks: ${n} pushed to Google Tasks`);
}

// ---------------------------------------------------------------------------

(async () => {
  const args = process.argv.slice(2);
  const has = f => args.includes(f);
  const weeks = Number((args.find(a => a.startsWith('--weeks=')) || '--weeks=2').split('=')[1]) || 2;
  const both = !has('--calendar') && !has('--tasks');

  const c = await connect();
  try {
    if (has('--calendar') || both) await pullCalendar(weeks, c);
    if (has('--tasks') || both) await pushTasks(has('--apply'), c);
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
