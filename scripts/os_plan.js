// Plan a week from the terminal.
//
//   node scripts/os_plan.js _week.json            report
//   node scripts/os_plan.js _week.json --apply    write
//
// Report only by default, like every other script here. Read the report, then
// apply.
//
// This is the write path for the OS while the dashboard has no text box. Calvin
// describes the week; this file is what that description becomes.
//
// Input shape. Every key is optional except week_of, so a mid-week correction
// can carry only the tasks that moved.
//
// {
//   "week_of": "2026-08-24",
//   "intent": "the Sunday paragraph, verbatim",
//   "replace_tasks": true,                 // wipe this week's tasks first
//   "replace_from": "2026-08-19",          // wipe only OPEN tasks from this day on
//   "set_status": { "done": [88,90], "moved": [87] },   // by os_task.id
//   "priority": [ { "rank":1, "label":"Pathwork", "kind":"company",
//                   "stream":null, "note":"top priority" } ],
//   "big_three": { "2026-08-24": [ {"title":"...", "note":"..."} ] },
//   "investors": [ { "firm":"Frontline Ventures", "domain":"frontline.vc",
//                    "invests_in":"seed B2B software in Europe and the US",
//                    "track":["Avallon","Vcola"], "notes":"" } ],
//   "briefs": { "<calendar external_id>": {
//                 "category":"company|investor|internal|other",
//                 "org":"Modo", "counterpart":"Johnny", "title":"Founder",
//                 "one_liner":"what they do", "focus":"what to focus on",
//                 "investor":"Frontline Ventures" } },
//   "tasks": [ { "day":"2026-08-24", "start":"10:45", "end":"12:30",
//                "stream":"sourcing", "subject":"Pathwork",
//                "subject_kind":"company|market|person",
//                "title":"...", "notes":"why it landed here",
//                "calendar_ref":"<external_id>", "origin":"calvin",
//                "due_on":"2026-09-08" } ]
// }
//
// Convention this encodes, from Calvin: sourcing is the focus of the working
// day, reading and deep work go at night, and a block may run to 24:00 so the
// evenings worth keeping clear are visible.

const fs = require('fs');
const { connect } = require('./db');

/** "20:00" -> 1200. "24:00" -> 1440. Minutes from Pacific midnight. */
function mins(t) {
  if (t === null || t === undefined || t === '') return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`bad time "${t}", expected HH:MM`);
  const v = Number(m[1]) * 60 + Number(m[2]);
  if (v < 0 || v > 1440) throw new Error(`time out of range: ${t}`);
  return v;
}

const pad = (s, n) => String(s ?? '').padEnd(n);

(async () => {
  const file = process.argv.find(a => a.endsWith('.json'));
  const apply = process.argv.includes('--apply');
  if (!file) { console.error('usage: node scripts/os_plan.js <file.json> [--apply]'); process.exit(1); }

  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!plan.week_of) throw new Error('week_of is required');

  // Validate everything before touching the database. A half applied week is
  // worse than a rejected one.
  const tasks = (plan.tasks || []).map((t, i) => {
    if (!t.day) throw new Error(`task ${i} ("${t.title}") has no day. Every task needs one.`);
    if (!t.title) throw new Error(`task ${i} has no title`);
    if (!t.stream) throw new Error(`task ${i} ("${t.title}") has no stream`);
    const s = mins(t.start), e = mins(t.end);
    if (s !== null && e !== null && e <= s) throw new Error(`task ${i} ("${t.title}") ends before it starts`);
    return { ...t, start_min: s, end_min: e };
  });

  const c = await connect();
  const log = [];
  let investorSort = 0;
  const run = (sql, args) => apply ? c.query(sql, args) : Promise.resolve({ rows: [] });

  // ---- week -------------------------------------------------------------
  let weekId = null;
  {
    const r = await c.query('select id, intent from os_week where week_of = $1', [plan.week_of]);
    if (r.rows.length) {
      weekId = r.rows[0].id;
      if (plan.intent) await run('update os_week set intent = $1, status = $2 where id = $3',
        [plan.intent, 'active', weekId]);
      if (plan.calls_goal) await run('update os_week set calls_goal = $1 where id = $2',
        [plan.calls_goal, weekId]);
      log.push(`week ${plan.week_of}: exists (#${weekId})${plan.intent ? ', intent updated' : ''}`);
    } else {
      const ins = await run(`insert into os_week (week_of, status, intent)
                             values ($1,'active',$2) returning id`, [plan.week_of, plan.intent || null]);
      weekId = ins.rows[0]?.id ?? null;
      log.push(`week ${plan.week_of}: created`);
    }
    if (apply) await c.query(`update os_week set status = 'closed'
                              where status = 'active' and week_of <> $1`, [plan.week_of]);
  }

  // ---- status changes on tasks that already exist ------------------------
  // A mid-week correction is mostly bookkeeping on tasks that are already in
  // the table: this one got done, that one slipped to Thursday. Without this
  // the only lever is replace_tasks, which wipes the whole week including the
  // days already behind us and everything marked done on them.
  // Ids leaving 'open' in this run. Tracked so the replace_from preview below
  // does not list a task as doomed that this same run is about to mark done.
  const leavingOpen = new Set();
  if (plan.set_status) {
    for (const [status, ids] of Object.entries(plan.set_status)) {
      if (!Array.isArray(ids) || !ids.length) continue;
      const found = await c.query(
        'select id, title, status from os_task where id = any($1) and week_id = $2', [ids, weekId]);
      const missing = ids.filter(i => !found.rows.some(r => Number(r.id) === Number(i)));
      if (missing.length) throw new Error(
        `set_status.${status}: no task in week ${plan.week_of} with id ${missing.join(', ')}`);
      await run(`update os_task
                    set status = $1, done_at = case when $1 = 'done' then now() else done_at end
                  where id = any($2)`, [status, ids]);
      for (const r of found.rows) log.push(`  ${r.status} -> ${status}  #${r.id} ${r.title}`);
      if (status !== 'open') ids.forEach(i => leavingOpen.add(Number(i)));
    }
  }

  // ---- scoped clear ------------------------------------------------------
  // replace_from wipes only the still-open tasks from a date onward, so a
  // Wednesday re-plan leaves Monday and Tuesday, and anything already marked
  // done, exactly where they are.
  if (plan.replace_from) {
    const doomed = await c.query(
      `select id, title, to_char(day,'YYYY-MM-DD') as dt from os_task
        where week_id = $1 and day >= $2 and status = 'open'
          and not (id = any($3)) order by day, sort`,
      [weekId, plan.replace_from, [...leavingOpen]]);
    log.push(`\nclearing ${doomed.rows.length} open task(s) from ${plan.replace_from} onward:`);
    for (const r of doomed.rows) log.push(`  - ${r.dt}  #${r.id} ${r.title}`);
    await run(`delete from os_task
                where week_id = $1 and day >= $2 and status = 'open' and not (id = any($3))`,
      [weekId, plan.replace_from, [...leavingOpen]]);
  }

  // ---- priority order ---------------------------------------------------
  if (plan.priority?.length) {
    await run('update os_priority set active = false where active');
    for (const p of plan.priority) {
      const co = p.kind === 'company' && apply
        ? (await c.query('select id from company where lower(name) = lower($1) limit 1', [p.label])).rows[0]
        : null;
      await run(`insert into os_priority (rank, label, kind, stream, company_id, note, active)
                 values ($1,$2,$3,$4,$5,$6,true)`,
        [p.rank, p.label, p.kind, p.stream || null, co?.id ?? null, p.note || null]);
    }
    log.push('priority: ' + plan.priority.map(p => `${p.rank} ${p.label}`).join(', '));
  }

  // ---- investors (firm level, persists across calls) --------------------
  const investorId = {};
  for (const inv of plan.investors || []) {
    const r = await run(`insert into os_investor (firm, domain, invests_in, track, notes, updated_at)
                         values ($1,$2,$3,$4,$5, now())
                         on conflict (firm) do update set
                           domain = coalesce(excluded.domain, os_investor.domain),
                           invests_in = coalesce(excluded.invests_in, os_investor.invests_in),
                           track = coalesce(excluded.track, os_investor.track),
                           notes = coalesce(excluded.notes, os_investor.notes),
                           updated_at = now()
                         returning id`,
      [inv.firm, inv.domain || null, inv.invests_in || null, inv.track || null, inv.notes || null]);
    investorId[inv.firm] = r.rows[0]?.id ?? null;
    log.push(`investor: ${inv.firm}` + (inv.track?.length ? ` (track: ${inv.track.join(', ')})` : ''));
  }
  if (apply) {
    const all = await c.query('select id, firm from os_investor');
    all.rows.forEach(r => { investorId[r.firm] = r.id; });
  }

  // ---- meeting briefs ---------------------------------------------------
  for (const [extId, b] of Object.entries(plan.briefs || {})) {
    const exists = (await c.query('select 1 from os_calendar_event where external_id = $1', [extId])).rows.length;
    if (!exists) { log.push(`brief SKIPPED, no such event: ${extId}`); continue; }
    const co = b.org && apply
      ? (await c.query('select id from company where lower(name) = lower($1) limit 1', [b.org])).rows[0]
      : null;
    await run(`insert into os_meeting_brief
        (external_id, category, org, counterpart, title, one_liner, focus, deal, conversation_type, company_id, investor_id, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       on conflict (external_id) do update set
         category = excluded.category, org = excluded.org,
         counterpart = excluded.counterpart, title = excluded.title,
         one_liner = coalesce(excluded.one_liner, os_meeting_brief.one_liner),
         focus = coalesce(excluded.focus, os_meeting_brief.focus),
         deal = coalesce(excluded.deal, os_meeting_brief.deal),
         conversation_type = coalesce(excluded.conversation_type, os_meeting_brief.conversation_type),
         company_id = coalesce(excluded.company_id, os_meeting_brief.company_id),
         investor_id = coalesce(excluded.investor_id, os_meeting_brief.investor_id),
         updated_at = now()`,
      [extId, b.category || 'other', b.org || null, b.counterpart || null, b.title || null,
       b.one_liner || null, b.focus || null, b.deal || null, b.conversation_type || null, co?.id ?? null,
       b.investor ? (investorId[b.investor] ?? null) : null]);
    log.push(`brief [${b.category || 'other'}] ${extId}: ${b.org || b.counterpart || ''}`);
  }

  // ---- the three big things --------------------------------------------
  for (const [day, items] of Object.entries(plan.big_three || {})) {
    if (items.length > 3) throw new Error(`big_three for ${day} has ${items.length}; the point is three`);
    if (apply) await c.query('delete from os_big_three where day = $1', [day]);
    let rank = 1;
    for (const it of items) {
      await run('insert into os_big_three (day, rank, title, note) values ($1,$2,$3,$4)',
        [day, rank, it.title, it.note || null]);
      log.push(`big three ${day} #${rank}: ${it.title}`);
      rank++;
    }
  }

  // ---- investor targets (the investor tab) -----------------------------
  for (const t of plan.investor_targets || []) {
    await run(`insert into os_investor_target
        (name, firm, title, linkedin, email, bucket, invests_in, why, message,
         source, tp_poc, verified, note, sort,
         relationship, last_outreach, last_response, next_action, relevant_cos,
         tier, firm_type, owner, cadence_days, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               $15,$16,$17,$18,$19,$20,$21,$22,$23, now())
       on conflict (name, firm) do update set
         title = excluded.title,
         linkedin = coalesce(excluded.linkedin, os_investor_target.linkedin),
         email = coalesce(excluded.email, os_investor_target.email),
         bucket = excluded.bucket, invests_in = excluded.invests_in,
         why = excluded.why, message = excluded.message,
         verified = excluded.verified, note = excluded.note,
         sort = excluded.sort,
         relationship = excluded.relationship,
         last_outreach = excluded.last_outreach,
         last_response = excluded.last_response,
         next_action = excluded.next_action,
         relevant_cos = excluded.relevant_cos,
         tier = excluded.tier, firm_type = excluded.firm_type,
         owner = coalesce(excluded.owner, os_investor_target.owner),
         cadence_days = excluded.cadence_days,
         updated_at = now()`,
      [t.name, t.firm, t.title || null, t.linkedin || null, t.email || null,
       t.bucket || 'coinvest', t.invests_in || null, t.why || null, t.message || null,
       t.source || 'AS BD targets', t.tp_poc || 'Calvin',
       t.verified === false ? false : true, t.note || null, investorSort++,
       t.relationship || null, t.last_outreach || null, t.last_response || null,
       t.next_action || null, t.relevant_cos || null, t.tier || null,
       t.firm_type || null, t.owner || 'Calvin', t.cadence_days || 60]);
  }
  if (plan.investor_targets?.length) {
    const unver = plan.investor_targets.filter(t => t.verified === false).length;
    log.push(`investor targets: ${plan.investor_targets.length}` +
      (unver ? ` (${unver} need verifying before sending)` : ''));
  }

  // ---- tasks -----------------------------------------------------------
  if (tasks.length) {
    if (plan.replace_tasks && apply) {
      const del = await c.query('delete from os_task where week_id = $1 returning 1', [weekId]);
      log.push(`tasks: cleared ${del.rowCount} existing`);
    } else if (plan.replace_tasks) {
      const n = await c.query('select count(*) n from os_task where week_id = $1', [weekId]);
      log.push(`tasks: would clear ${n.rows[0].n} existing`);
    }

    let sort = 0;
    for (const t of tasks) {
      let companyId = null, marketId = null;
      const kind = t.subject_kind || (t.subject ? 'company' : 'none');
      if (apply && t.subject && kind === 'company') {
        companyId = (await c.query('select id from company where lower(name) = lower($1) limit 1',
          [t.subject])).rows[0]?.id ?? null;
      }
      if (apply && t.subject && kind === 'market') {
        marketId = (await c.query(`insert into os_market (name) values ($1)
                                   on conflict (name) do update set name = excluded.name
                                   returning id`, [t.subject])).rows[0]?.id ?? null;
      }
      await run(`insert into os_task
          (title, notes, stream, subject_kind, subject_label, company_id, market_id,
           week_id, day, start_min, end_min, due_on, calendar_ref, origin, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [t.title, t.notes || null, t.stream, kind, t.subject || null, companyId, marketId,
         weekId, t.day, t.start_min, t.end_min, t.due_on || null,
         t.calendar_ref || null, t.origin || 'calvin', sort++]);
    }

    // Print the week as it will read, grouped by day, so the shape of each day
    // is reviewable before anything is written.
    const byDay = {};
    for (const t of tasks) (byDay[t.day] ||= []).push(t);
    log.push('');
    for (const day of Object.keys(byDay).sort()) {
      const rows = byDay[day].slice().sort((a, b) => (a.start_min ?? 9999) - (b.start_min ?? 9999));
      const evening = rows.filter(r => (r.start_min ?? 0) >= 1080).length;
      log.push(`${day}  (${rows.length} task${rows.length === 1 ? '' : 's'}` +
               (evening ? `, ${evening} evening` : '') + ')');
      for (const r of rows) {
        const slot = r.start_min === null ? '  no time  '
          : `${String(Math.floor(r.start_min / 60)).padStart(2, '0')}:${String(r.start_min % 60).padStart(2, '0')}` +
            `-${String(Math.floor((r.end_min ?? r.start_min) / 60)).padStart(2, '0')}:${String((r.end_min ?? 0) % 60).padStart(2, '0')}`;
        log.push(`  ${slot}  ${pad('[' + r.stream + ']', 12)}${r.subject ? r.subject + ': ' : ''}${r.title}`);
      }
    }
  }

  console.log(log.join('\n'));
  console.log(apply ? '\napplied.' : '\nreport only. re-run with --apply');
  await c.end();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
