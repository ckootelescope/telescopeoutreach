// Migration: followups.json + Activity Log + research/*.json  ->  Supabase
// phase1 = intent (no Gmail).  phase2 = reconcile against Gmail.  report = diff.
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const norm = d => String(d || '').toLowerCase().trim().replace(/^www\./, '');
const ptDate = iso => new Date(Date.parse(iso) - 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

function loadSources() {
  const fu = JSON.parse(fs.readFileSync(path.join(ROOT, 'followups.json'), 'utf8')).pending;
  // Activity Log is optional. Without it we lose opener dates and orphan
  // detection, both of which phase2/backfill can add later.
  const trkPath = path.join(ROOT, '_tracker_read.json');
  let trk = [];
  if (fs.existsSync(trkPath)) trk = JSON.parse(fs.readFileSync(trkPath, 'utf8')).slice(1);
  else console.log('NOTE: _tracker_read.json missing - importing from followups.json + research only');
  const research = fs.readdirSync(path.join(ROOT, 'research'))
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'research', f), 'utf8')); } catch { return null; } })
    .filter(Boolean);
  return { fu, trk, research };
}

// ---------------------------------------------------------------- phase 1

async function phase1() {
  const { fu, trk, research } = loadSources();
  const c = await connect();
  await c.query('begin');

  // ---- companies, merged by name so alias domains collapse
  const byName = new Map();          // lowercased name -> {name, domains:Set}
  const addCo = (name, domain) => {
    const n = String(name || '').trim();
    if (!n) return;
    const k = n.toLowerCase();
    if (!byName.has(k)) byName.set(k, { name: n, domains: new Set() });
    if (norm(domain)) byName.get(k).domains.add(norm(domain));
  };
  fu.forEach(e => addCo(e.company, e.domain));
  trk.forEach(r => addCo(r[1], r[2]));
  research.forEach(d => addCo(d.company, d.domain));

  const coId = new Map();            // domain -> company id ; also name -> id
  let nCo = 0, nDom = 0;
  for (const { name, domains } of byName.values()) {
    const list = [...domains];
    const primary = list[0] || (name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.unknown');
    const r = await c.query(
      `insert into company (name, primary_domain) values ($1,$2)
       on conflict (primary_domain) do update set name = excluded.name
       returning id`, [name, primary]);
    const id = r.rows[0].id;
    nCo++;
    coId.set('name:' + name.toLowerCase(), id);
    for (const d of (list.length ? list : [primary])) {
      await c.query(`insert into company_domain (domain, company_id) values ($1,$2)
                     on conflict (domain) do nothing`, [d, id]);
      coId.set(d, id);
      nDom++;
    }
  }

  // ---- contacts
  const ctId = new Map();
  const addCt = async (email, name, companyId, linkedin) => {
    const em = String(email || '').toLowerCase().trim();
    if (!em || !companyId) return null;
    if (ctId.has(em)) return ctId.get(em);
    const r = await c.query(
      `insert into contact (company_id, name, email, linkedin) values ($1,$2,$3,$4)
       on conflict (email) do update set name = coalesce(contact.name, excluded.name)
       returning id`, [companyId, name || null, em, linkedin || null]);
    ctId.set(em, r.rows[0].id);
    return r.rows[0].id;
  };
  for (const e of fu) {
    const cid = coId.get(norm(e.domain)) || coId.get('name:' + String(e.company).toLowerCase());
    await addCt(e.email, e.founder, cid);
  }
  for (const r of trk) {
    const cid = coId.get(norm(r[2])) || coId.get('name:' + String(r[1]).toLowerCase());
    await addCt(r[4], r[3], cid);
  }

  // ---- opener dates from the tracker (Email 1 / Round 2 Email 1, action SENT)
  const openers = new Map();         // email|round -> {date, thread, stage}
  trk.forEach(r => {
    if (r[5] !== 'SENT' || !/Email 1/.test(r[6] || '')) return;
    const em = String(r[4] || '').toLowerCase().trim();
    const round = /Round 2/i.test(r[6]) ? 2 : 1;
    const key = em + '|' + round;
    const d = ptDate(r[0]);
    if (!openers.has(key) || openers.get(key).date > d) openers.set(key, { date: d, thread: r[7] || null, stage: r[6] });
  });

  // ---- sequences from followups.json, grouped by slug + round
  const groups = new Map();
  fu.forEach(e => {
    const k = e.slug + '|' + (e.round || 1);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  });

  let nSeq = 0, nStep = 0, skipped = [];
  for (const [key, entries] of groups) {
    const e0 = entries[0];
    const round = e0.round || 1;
    const cid = coId.get(norm(e0.domain)) || coId.get('name:' + String(e0.company).toLowerCase());
    const ctid = ctId.get(String(e0.email).toLowerCase());
    if (!cid || !ctid) { skipped.push(key + ' (no company/contact)'); continue; }

    const st = new Set(entries.map(x => x.status));
    const seqStatus =
      st.has('replied') ? 'replied' :
      st.has('bounced') ? 'bounced' :
      st.has('pending') ? 'active' :
      [...st].every(s => s === 'cancelled') ? 'cancelled' : 'completed';

    const dates = entries.map(x => x.sendDate).sort();
    const opener = openers.get(String(e0.email).toLowerCase() + '|' + round);
    const startedOn = opener ? opener.date : addDays(dates[0], -2);

    let seqId;
    try {
      const r = await c.query(
        `insert into sequence (company_id, contact_id, round, kind, subject, status, started_on)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (company_id, round) do update set status = excluded.status
         returning id`,
        [cid, ctid, round, round >= 2 ? 'restart' : 'first', e0.subject || 'Telescope Intro',
         seqStatus === 'active' ? 'needs_scheduling' : seqStatus, startedOn]);
      seqId = r.rows[0].id;
    } catch (err) { skipped.push(key + ' (' + err.message.slice(0, 60) + ')'); continue; }
    nSeq++;

    // step 1 - never stored in the old system, reconstructed here
    await c.query(
      `insert into step (sequence_id, step_no, due_date, thread_id, status)
       values ($1,1,$2,$3,'planned') on conflict (sequence_id, step_no) do nothing`,
      [seqId, startedOn, opener ? opener.thread : e0.threadId || null]);
    nStep++;

    for (const e of entries) {
      const stepStatus =
        e.status === 'pending' ? 'planned' :
        e.status === 'cancelled' ? 'cancelled' :
        e.status === 'bounced' ? 'cancelled' : 'drafted';
      await c.query(
        `insert into step (sequence_id, step_no, due_date, body_html, thread_id, drafted_at, status)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (sequence_id, step_no) do nothing`,
        [seqId, e.emailNumber, e.sendDate, e.body || null, e.threadId || null,
         e.processedAt || null, stepStatus]);
      nStep++;
    }

    // restore 'active' now that the steps exist (trigger is deferred to commit)
    if (seqStatus === 'active') await c.query(`update sequence set status='active' where id=$1`, [seqId]);
  }

  // ---- openers with no cadence at all -> needs_scheduling
  let nOrphan = 0;
  for (const [key, o] of openers) {
    const [em, roundStr] = key.split('|');
    const round = Number(roundStr);
    const ctid = ctId.get(em);
    if (!ctid) continue;
    const cr = await c.query(`select company_id from contact where id=$1`, [ctid]);
    const cid = cr.rows[0].company_id;
    const ex = await c.query(`select id from sequence where company_id=$1 and round=$2`, [cid, round]);
    if (ex.rows.length) continue;
    const sr = await c.query(
      `insert into sequence (company_id, contact_id, round, kind, subject, status, started_on)
       values ($1,$2,$3,$4,$5,'needs_scheduling',$6) returning id`,
      [cid, ctid, round, round >= 2 ? 'restart' : 'first', 'Telescope Intro', o.date]);
    await c.query(
      `insert into step (sequence_id, step_no, due_date, thread_id, status)
       values ($1,1,$2,$3,'planned')`, [sr.rows[0].id, o.date, o.thread]);
    nOrphan++; nStep++;
  }

  await c.query('commit');
  console.log(JSON.stringify({ companies: nCo, domains: nDom, contacts: ctId.size,
    sequences: nSeq, needs_scheduling: nOrphan, steps: nStep, skipped: skipped.length }, null, 1));
  if (skipped.length) { console.log('skipped:'); skipped.slice(0, 25).forEach(s => console.log('  ' + s)); }
  await c.end();
}

// ---------------------------------------------------------------- phase 2

async function phase2() {
  const events = JSON.parse(fs.readFileSync(path.join(ROOT, '_mail_sweep.json'), 'utf8'));
  const c = await connect();
  const ct = await c.query(`select id, email, company_id from contact`);
  const byEmail = new Map(ct.rows.map(r => [r.email.toLowerCase(), r]));

  let ins = 0, unmatched = 0;
  for (const e of events) {
    const peer = String(e.peer || '').toLowerCase();
    const hit = byEmail.get(peer);
    if (!hit) { unmatched++; continue; }
    const r = await c.query(
      `insert into email_event (contact_id, company_id, direction, sender_email, peer_email,
                                thread_id, message_id, subject, sent_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (message_id) do nothing returning id`,
      [hit.id, hit.company_id, e.direction, e.from || null, peer, e.threadId, e.id, e.subject || null,
       new Date(e.ts).toISOString()]);
    if (r.rows.length) ins++;
  }

  // set sent_at on steps from observed outbound mail in the same thread
  const upd = await c.query(`
    with m as (
      select s.id step_id, min(e.sent_at) as sent_at
        from step s
        join sequence q on q.id = s.sequence_id
        join email_event e on e.company_id = q.company_id and e.direction = 'out'
       where s.sent_at is null
         and e.sent_at::date between s.due_date - 1 and s.due_date + 6
       group by s.id)
    update step set sent_at = m.sent_at,
                    status = case when step.status in ('planned','drafted') then 'sent' else step.status end
      from m where step.id = m.step_id returning step.id`);

  console.log(JSON.stringify({ events_inserted: ins, unmatched_peers: unmatched, steps_dated: upd.rowCount }, null, 1));
  await c.end();
}

// ------------------------------------------------- phase 2t (from tracker)
// Gmail creds are dead, so observed state comes from the Activity Log instead.
// Everything written here is tagged source='tracker' so a later Gmail sweep
// can supersede it rather than silently agreeing with it.

async function phase2t() {
  const { trk } = loadSources();
  const c = await connect();
  await c.query(`alter table email_event add column if not exists source text not null default 'gmail'`);

  const ct = await c.query(`select id, email, company_id from contact`);
  const byEmail = new Map(ct.rows.map(r => [r.email.toLowerCase(), r]));

  const OUT = new Set(['SENT', 'FOLLOWUP_SENT']);
  const IN  = new Set(['REPLIED', 'REPLY_RECEIVED']);

  let ins = 0, unmatched = 0, bounced = 0;
  for (const r of trk) {
    const [ts, , , , emailRaw, action, stage, thread] = r;
    const em = String(emailRaw || '').toLowerCase().trim();
    if (!em || !ts) continue;
    const hit = byEmail.get(em);
    if (!hit) { unmatched++; continue; }
    const dir = OUT.has(action) ? 'out' : IN.has(action) ? 'in' : null;
    if (!dir) {
      if (action === 'BOUNCED') {
        bounced++;
        await c.query(`update sequence set status='bounced' where contact_id=$1 and status not in ('replied')`, [hit.id]);
      }
      continue;
    }
    const mid = 'trk:' + Date.parse(ts) + ':' + em + ':' + action + ':' + (stage || '');
    const res = await c.query(
      `insert into email_event (contact_id, company_id, direction, peer_email, thread_id, message_id, subject, sent_at, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'tracker') on conflict (message_id) do nothing returning id`,
      [hit.id, hit.company_id, dir, em, thread || null, mid, stage || null, new Date(Date.parse(ts)).toISOString()]);
    if (res.rows.length) ins++;
  }

  // sequences with any inbound event are 'replied'
  const rep = await c.query(`
    update sequence q set status='replied'
      from email_event e
     where e.company_id = q.company_id and e.direction='in'
       and q.status in ('active','completed','needs_scheduling')
    returning q.id`);

  // step.sent_at from the matching outbound tracker event
  const upd = await c.query(`
    with m as (
      select s.id step_id, min(e.sent_at) sent_at
        from step s
        join sequence q on q.id = s.sequence_id
        join email_event e on e.company_id = q.company_id and e.direction='out'
       where s.sent_at is null
         and e.subject is not null
         and (
              (q.round = 1 and e.subject = 'Email ' || s.step_no)
           or (q.round >= 2 and s.step_no = 1 and e.subject like 'Round 2%')
         )
       group by s.id)
    update step set sent_at = m.sent_at,
                    status = case when step.status in ('planned','drafted') then 'sent' else step.status end
      from m where step.id = m.step_id returning step.id`);

  console.log(JSON.stringify({ events_inserted: ins, unmatched_contacts: unmatched,
    bounced_sequences: bounced, sequences_marked_replied: rep.rowCount, steps_dated: upd.rowCount }, null, 1));
  await c.end();
}

// ---------------------------------------------------------------- report

async function report() {
  const c = await connect();
  const q = async (label, sql) => {
    const r = await c.query(sql);
    console.log('\n== ' + label);
    if (!r.rows.length) { console.log('   (none)'); return; }
    r.rows.slice(0, 40).forEach(row => console.log('   ' + Object.values(row).map(v => v === null ? '-' : String(v)).join(' | ')));
    if (r.rows.length > 40) console.log('   ... +' + (r.rows.length - 40) + ' more');
  };
  await q('counts', `select
      (select count(*) from company) companies,
      (select count(*) from contact) contacts,
      (select count(*) from sequence) sequences,
      (select count(*) from step) steps,
      (select count(*) from email_event) email_events`);
  await q('sequences by status', `select status, kind, count(*) from sequence group by 1,2 order by 3 desc`);
  await q('broken state (by issue)', `select issue, count(*) from v_broken_state group by 1 order by 2 desc`);
  await q('weekly net new vs restart (sent openers)', `select * from v_weekly limit 12`);
  await q('due now', `select company, founder, step_no, due_date from v_due limit 20`);
  await c.end();
}

const cmds = { phase1, phase2, phase2t, report };
const cmd = process.argv[2];
if (!cmds[cmd]) {
  console.error('usage: migrate.js ' + Object.keys(cmds).join('|'));
  process.exit(1);
}
cmds[cmd]().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
