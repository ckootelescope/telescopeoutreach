// Build the outreach dashboard as a single self-contained HTML file.
//
// Reads Supabase directly rather than the dash_* views alone, because the page
// needs a few shapes the views do not expose (per-day load, reply feed). The
// views stay the source of truth for the numbers they do define.
//
//   node scripts/dashboard.js            writes dashboard.html
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const TODAY = new Date().toISOString().slice(0, 10);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const engine = k => k === 'restart' ? 'R2' : 'R1';

async function main() {
  const c = await connect();

  const summary = (await c.query(`select * from dash_summary`)).rows[0];

  const due = (await c.query(`
    select co.name company, co.primary_domain domain, ct.name founder, ct.email,
           q.kind, s.step_no, s.due_date::text due, s.status
      from step s
      join sequence q on q.id = s.sequence_id
      join company co on co.id = q.company_id
      join contact ct on ct.id = q.contact_id
     where q.status = 'active' and s.status in ('planned','drafted')
       and s.due_date <= current_date
     order by s.due_date, co.name`)).rows;

  const upcoming = (await c.query(`
    select s.due_date::text d, q.kind, count(*)::int n
      from step s join sequence q on q.id = s.sequence_id
     where q.status = 'active' and s.status in ('planned','drafted')
       and s.due_date > current_date and s.due_date <= current_date + 14
     group by 1,2 order by 1`)).rows;

  const replies = (await c.query(`
    select co.name company, co.primary_domain domain, e.sender_email, e.sent_at::date::text on_date,
           e.subject
      from email_event e join company co on co.id = e.company_id
     where e.direction = 'in' and e.sent_at > current_date - 21
     order by e.sent_at desc limit 12`)).rows;

  const problems = (await c.query(`
    select 'Drafted, never sent' label, co.name company, ct.email, s.step_no, s.due_date::text due
      from step s join sequence q on q.id = s.sequence_id
      join company co on co.id = q.company_id join contact ct on ct.id = q.contact_id
     where s.status = 'drafted' and q.status = 'active'
    union all
    select 'No prior-contact check', co.name, ct.email, null, null
      from sequence q join company co on co.id = q.company_id join contact ct on ct.id = q.contact_id
     where q.status = 'active'
       and not exists (select 1 from prior_check p where p.company_id = co.id)
     order by 1, 2`)).rows;

  const roster = (await c.query(`
    select co.name company, co.primary_domain domain, ct.name founder, ct.email, q.kind,
           min(s.step_no) next_step, min(s.due_date)::text next_due,
           max(s.due_date)::text ends_on,
           (select count(*) from step x where x.sequence_id = q.id and x.status = 'sent')::int sent
      from sequence q
      join company co on co.id = q.company_id
      join contact ct on ct.id = q.contact_id
      join step s on s.sequence_id = q.id and s.status in ('planned','drafted')
     where q.status = 'active'
     group by co.name, co.primary_domain, ct.name, ct.email, q.kind, q.id
     order by min(s.due_date), co.name`)).rows;

  const week = (await c.query(`
    select count(*)::int n from email_event
     where direction = 'out' and sent_at > current_date - 7`)).rows[0].n;

  await c.end();

  const overdue = due.filter(d => d.due < TODAY);
  const byDay = new Map();
  upcoming.forEach(u => {
    if (!byDay.has(u.d)) byDay.set(u.d, { first: 0, restart: 0 });
    byDay.get(u.d)[u.kind] = u.n;
  });
  const peak = Math.max(1, ...[...byDay.values()].map(v => v.first + v.restart));

  const kpi = [
    { k: 'Due now', v: due.length, tone: due.length ? 'warn' : 'ok', sub: overdue.length ? overdue.length + ' overdue' : 'nothing late' },
    { k: 'Active sequences', v: summary.active_sequences, sub: 'in cadence' },
    { k: 'Replied', v: summary.replied_sequences, tone: 'ok', sub: 'all time' },
    { k: 'Sent, last 7d', v: week, sub: 'emails out' },
    { k: 'Companies', v: summary.companies, sub: 'on record' },
    { k: 'Restart candidates', v: summary.restart_candidates, sub: 'cold, never restarted' },
  ];

  const dueRows = due.map(d => {
    const late = days(d.due, TODAY);
    const tone = late > 2 ? 'stop' : late > 0 ? 'warn' : '';
    return `<tr class="${tone}">
      <td class="co">${esc(d.company)}</td>
      <td class="mono dim">${esc(d.founder || '')}</td>
      <td class="mono dim">${esc(d.email)}</td>
      <td><span class="pill ${d.kind === 'restart' ? 'r2' : 'r1'}">${engine(d.kind)}</span></td>
      <td class="mono">Email ${d.step_no}</td>
      <td class="mono">${esc(d.due)}</td>
      <td class="mono status">${late > 0 ? late + 'd late' : 'today'}</td>
    </tr>`;
  }).join('');

  const dayBars = [...byDay.entries()].map(([d, v]) => {
    const total = v.first + v.restart;
    const dow = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const weekend = /Sat|Sun/.test(dow);
    return `<div class="day${weekend ? ' weekend' : ''}">
      <div class="bar" style="--h:${(total / peak * 100).toFixed(1)}%">
        <span class="seg r2" style="flex:${v.restart}"></span><span class="seg r1" style="flex:${v.first}"></span>
      </div>
      <div class="n mono">${total}</div>
      <div class="dow mono">${dow}</div>
      <div class="dt mono">${d.slice(5)}</div>
    </div>`;
  }).join('');

  const replyRows = replies.length ? replies.map(r => `<li>
      <span class="co">${esc(r.company)}</span>
      <span class="mono dim">${esc(r.sender_email)}</span>
      <span class="mono when">${esc(r.on_date)}</span>
    </li>`).join('') : '<li class="empty">No replies in the last 21 days.</li>';

  const problemRows = problems.length ? problems.map(p => `<li>
      <span class="tag">${esc(p.label)}</span>
      <span class="co">${esc(p.company)}</span>
      <span class="mono dim">${p.step_no ? 'Email ' + p.step_no : ''}</span>
      <span class="mono when">${esc(p.due || '')}</span>
    </li>`).join('') : '<li class="empty">Nothing broken. Every active cadence is complete and checked.</li>';

  const rosterRows = roster.map(r => {
    const late = days(r.next_due, TODAY);
    return `<tr>
      <td class="co">${esc(r.company)}</td>
      <td class="mono dim"><a href="https://${esc(r.domain)}">${esc(r.domain)}</a></td>
      <td class="mono dim">${esc(r.founder || '')}</td>
      <td><span class="pill ${r.kind === 'restart' ? 'r2' : 'r1'}">${engine(r.kind)}</span></td>
      <td class="mono"><span class="prog">${'●'.repeat(r.sent)}${'○'.repeat(Math.max(0, 4 - r.sent))}</span></td>
      <td class="mono">Email ${r.next_step}</td>
      <td class="mono ${late > 0 ? 'is-late' : ''}">${esc(r.next_due)}</td>
      <td class="mono dim">${esc(r.ends_on)}</td>
    </tr>`;
  }).join('');

  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles',
    dateStyle: 'medium', timeStyle: 'short' });

  const html = `<title>Outreach Console</title>
<style>
:root{
  --ground:#F6F7F9; --surface:#FFFFFF; --sunk:#EFF1F5;
  --ink:#161A22; --ink-2:#5C6473; --ink-3:#8A91A0;
  --line:#E2E6ED; --line-2:#D2D8E2;
  --accent:#2E4B7B; --accent-soft:#E8EDF6;
  --warn:#B26A00; --warn-soft:#FBF0DC;
  --ok:#2E7A52; --ok-soft:#E3F1E9;
  --stop:#A33A33; --stop-soft:#F8E7E5;
  --mono:ui-monospace,"SFMono-Regular","Cascadia Mono","Consolas","Liberation Mono",monospace;
  --sans:ui-sans-serif,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#0F1219; --surface:#161A23; --sunk:#1C212C;
  --ink:#E7EAF1; --ink-2:#9BA3B4; --ink-3:#6E7688;
  --line:#252B37; --line-2:#323A4A;
  --accent:#87A8DE; --accent-soft:#1B2434;
  --warn:#D9A441; --warn-soft:#2A2113;
  --ok:#6BBE8F; --ok-soft:#142318;
  --stop:#E0766C; --stop-soft:#2A1614;
}}
:root[data-theme="dark"]{
  --ground:#0F1219; --surface:#161A23; --sunk:#1C212C;
  --ink:#E7EAF1; --ink-2:#9BA3B4; --ink-3:#6E7688;
  --line:#252B37; --line-2:#323A4A;
  --accent:#87A8DE; --accent-soft:#1B2434;
  --warn:#D9A441; --warn-soft:#2A2113;
  --ok:#6BBE8F; --ok-soft:#142318;
  --stop:#E0766C; --stop-soft:#2A1614;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:12.5px}
.dim{color:var(--ink-2)}
.wrap{max-width:1180px;margin:0 auto;padding:40px 24px 72px;display:flex;flex-direction:column;gap:34px}

header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;
  border-bottom:2px solid var(--ink);padding-bottom:14px}
h1{margin:0;font-size:26px;letter-spacing:-0.015em;font-weight:650}
header .meta{font-family:var(--mono);font-size:12px;color:var(--ink-2);text-align:right}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:3px;overflow:hidden}
.kpi{background:var(--surface);padding:16px 18px;display:flex;flex-direction:column;gap:3px}
.kpi .k{font-family:var(--mono);font-size:10.5px;letter-spacing:0.09em;text-transform:uppercase;color:var(--ink-3)}
.kpi .v{font-family:var(--mono);font-size:30px;font-variant-numeric:tabular-nums;line-height:1.1;letter-spacing:-0.02em}
.kpi .s{font-family:var(--mono);font-size:11px;color:var(--ink-2)}
.kpi.warn .v{color:var(--warn)} .kpi.ok .v{color:var(--ok)}

section{display:flex;flex-direction:column;gap:12px}
h2{margin:0;font-size:12px;font-family:var(--mono);letter-spacing:0.1em;text-transform:uppercase;
  color:var(--ink-2);display:flex;align-items:baseline;gap:10px}
h2 .count{color:var(--ink);font-size:13px}
h2::after{content:"";flex:1;height:1px;background:var(--line)}

.panel{background:var(--surface);border:1px solid var(--line);border-radius:3px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-family:var(--mono);font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;
  color:var(--ink-3);text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);
  white-space:nowrap;font-weight:500}
td{padding:9px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--sunk)}
td.co{font-weight:600}
td a{color:var(--accent);text-decoration:none}
td a:hover{text-decoration:underline}
.is-late{color:var(--warn)}
td.status{color:var(--ink-2)}
tr.warn td.status{color:var(--warn)} tr.stop td.status{color:var(--stop);font-weight:600}
tr.warn td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
tr.stop td:first-child{box-shadow:inset 3px 0 0 var(--stop)}
.prog{color:var(--accent);letter-spacing:2px;font-size:10px}

.pill{font-family:var(--mono);font-size:10px;letter-spacing:0.06em;padding:2px 6px;border-radius:2px;
  border:1px solid var(--line-2);color:var(--ink-2)}
.pill.r1{background:var(--accent-soft);color:var(--accent);border-color:transparent}
.pill.r2{background:var(--warn-soft);color:var(--warn);border-color:transparent}

.two{display:grid;grid-template-columns:1fr 1fr;gap:34px}
@media (max-width:820px){.two{grid-template-columns:1fr}}
ul.feed{list-style:none;margin:0;padding:0}
ul.feed li{display:flex;align-items:baseline;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line)}
ul.feed li:last-child{border-bottom:0}
ul.feed .co{font-weight:600;font-size:13.5px}
ul.feed .when{margin-left:auto;color:var(--ink-3)}
ul.feed .empty{color:var(--ink-2);font-style:italic}
.tag{font-family:var(--mono);font-size:10px;letter-spacing:0.05em;text-transform:uppercase;
  background:var(--stop-soft);color:var(--stop);padding:2px 6px;border-radius:2px;white-space:nowrap}

.chart{display:flex;gap:4px;align-items:flex-end;padding:18px 14px 12px;min-height:150px}
.day{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:34px}
.day.weekend{opacity:0.55}
.bar{width:100%;height:82px;display:flex;flex-direction:column;justify-content:flex-end}
.bar .seg{display:block;width:100%}
.bar{position:relative}
.bar::after{content:"";position:absolute;inset:auto 0 0 0;height:1px;background:var(--line-2)}
.seg.r1{background:var(--accent)} .seg.r2{background:var(--warn)}
.day .n{font-size:11.5px;font-weight:600}
.day .dow,.day .dt{font-size:10px;color:var(--ink-3)}
.legend{display:flex;gap:16px;padding:0 14px 14px;font-family:var(--mono);font-size:11px;color:var(--ink-2)}
.legend i{display:inline-block;width:9px;height:9px;margin-right:5px;vertical-align:baseline}
.legend .r1{background:var(--accent)} .legend .r2{background:var(--warn)}

footer{font-family:var(--mono);font-size:11px;color:var(--ink-3);border-top:1px solid var(--line);padding-top:14px}
</style>

<div class="wrap">
  <header>
    <div>
      <h1>Outreach Console</h1>
      <div class="mono dim">Telescope Partners &middot; company outreach only</div>
    </div>
    <div class="meta">Generated ${esc(stamp)} PT<br>Source: Supabase &middot; Gmail is authoritative</div>
  </header>

  <div class="kpis">
    ${kpi.map(k => `<div class="kpi ${k.tone || ''}">
      <div class="k">${esc(k.k)}</div><div class="v">${esc(k.v)}</div><div class="s">${esc(k.sub)}</div>
    </div>`).join('')}
  </div>

  <section>
    <h2>Needs you today <span class="count">${due.length}</span></h2>
    <div class="panel">
      ${due.length ? `<table>
        <thead><tr><th>Company</th><th>Founder</th><th>Email</th><th>Engine</th>
          <th>Step</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>${dueRows}</tbody></table>`
        : '<ul class="feed"><li class="empty">Nothing due. Every cadence is up to date.</li></ul>'}
    </div>
  </section>

  <div class="two">
    <section>
      <h2>Needs fixing <span class="count">${problems.length}</span></h2>
      <div class="panel"><ul class="feed">${problemRows}</ul></div>
    </section>
    <section>
      <h2>Recent replies <span class="count">${replies.length}</span></h2>
      <div class="panel"><ul class="feed">${replyRows}</ul></div>
    </section>
  </div>

  <section>
    <h2>Next 14 days <span class="count">${upcoming.reduce((a, b) => a + b.n, 0)} scheduled</span></h2>
    <div class="panel">
      <div class="chart">${dayBars || '<div class="mono dim" style="padding:8px">Nothing scheduled.</div>'}</div>
      <div class="legend"><span><i class="r1"></i>Round 1</span><span><i class="r2"></i>Round 2 restart</span></div>
    </div>
  </section>

  <section>
    <h2>Active roster <span class="count">${roster.length}</span></h2>
    <div class="panel"><table>
      <thead><tr><th>Company</th><th>Website</th><th>Founder</th><th>Engine</th>
        <th>Sent</th><th>Next</th><th>Due</th><th>Ends</th></tr></thead>
      <tbody>${rosterRows}</tbody></table></div>
  </section>

  <footer>
    Regenerate with <span style="color:var(--ink-2)">node scripts/dashboard.js</span>.
    A step counts as sent only when the message left the mailbox, not when a draft was created.
  </footer>
</div>`;

  fs.writeFileSync(path.join(ROOT, 'dashboard.html'), html);
  console.log('wrote dashboard.html');
  console.log(JSON.stringify({ due: due.length, overdue: overdue.length, problems: problems.length,
    replies: replies.length, roster: roster.length, scheduled_14d: upcoming.reduce((a, b) => a + b.n, 0) }, null, 1));
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
