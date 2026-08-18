// Seed the Weekly OS with the week of 2026-08-24, parsed from Calvin's own
// Sunday paragraph, plus the priority order he declared.
//
//   node scripts/os_seed.js [--apply]
//
// Idempotent: re-running replaces this week's tasks rather than doubling them.
//
// The calendar events here were captured from the live calendar on 2026-08-18 so
// the page has something real to render before the Google scopes are granted.
// Once `node scripts/os_sync.js --calendar` runs, that becomes the source and
// this block is dead weight.

const { connect } = require('./db');

const WEEK = '2026-08-24';

const INTENT = `So this week aside from the calls that I have on the calendar - my priority is around diligence for our priority companies. I need to get smarter on Pathwork so I need to build out a list of competitors to pathwork, get the expert networks active and get calls scheduled although I think I have a lot for this week so mainly building out a list of which experts we need to speak with going forward, I'll need to organize all the customer call notes and also do my own diligence on the opportunity by reading through the document that Chris sent to me. I need to connect with Bhargav on insurance experts he's spoken with. On Jampack, I need to send to market outreach to end customers in the CPG space ideally at some larger CPG brands and ping the expert networks on that. My sourcing pipeline is also pretty dry so I definitely need to send some net new outreach and go through my Harmonic agent that's been feeding me companies. I also need to reactivate some sequences to old prospects while also sending all the relevant follow up emails. I need you to feed me some investors that I should connect with as well - I think I want to target seed firms or firms that are relevant from the AS BD targets that are relevant to Telescope. I'll also need to take a good action for each hard to crack company. I need to start sending outreach around the insuretech conference in september in vegas`;

// Calvin's declared order. Sourcing sits above everything except Pathwork.
const PRIORITIES = [
  { rank: 1, label: 'Pathwork', kind: 'company', note: 'top priority' },
  { rank: 2, label: 'Sourcing', kind: 'stream', stream: 'sourcing', note: 'above everything except Pathwork' },
  { rank: 3, label: 'Rebar', kind: 'company' },
  { rank: 4, label: 'Jampack', kind: 'company' },
];

const MARKETS = [
  { name: 'Life insurance', thesis: 'Pathwork sits here. Bhargav has experts. InsureTech Connect is the September event.' },
  { name: 'CPG wholesale operations', thesis: 'Jampack sits here. Matt Weiss at Kir Foods is the first operator conversation.' },
];

// The fourteen items, with the day each was placed on and why.
const TASKS = [
  // --- Pathwork, rank 1 -----------------------------------------------------
  { t: 'Build the competitor list', s: 'diligence', sub: 'Pathwork', day: '2026-08-25',
    n: '9:00 to 13:30 is the only clear stretch on Tuesday.' },
  { t: "Read Chris's document on the opportunity", s: 'diligence', sub: 'Pathwork', day: '2026-08-26',
    n: "9:30 to 14:00 is the week's longest uninterrupted block." },
  { t: 'List the experts we need to speak with going forward', s: 'diligence', sub: 'Pathwork', day: '2026-08-26',
    n: 'Scheduling the calls was explicitly deferred: too much on this week.' },
  { t: 'Organize the customer call notes', s: 'diligence', sub: 'Pathwork', day: '2026-08-28' },
  { t: 'Bring open questions to the Chris sync', s: 'diligence', sub: 'Pathwork', day: '2026-08-24',
    n: 'Anchored to the 16:00 sync.', cal: 'sync-chris-mon' },
  { t: 'Connect with Bhargav on the insurance experts he has spoken with', s: 'diligence', sub: 'Pathwork', day: null },

  // --- Sourcing, rank 2 ----------------------------------------------------
  { t: 'Send the follow-ups due today', s: 'sourcing', sub: null, day: '2026-08-24', origin: 'expanded',
    n: 'Fanned out from "all the relevant follow up emails". The specific list comes from v_due.' },
  { t: 'Work the Harmonic agent feed into net new outreach', s: 'sourcing', sub: null, day: '2026-08-27' },
  { t: 'Send net new outreach', s: 'sourcing', sub: null, day: '2026-08-28', n: 'Light day, travelling.' },
  { t: 'Reactivate sequences for old prospects', s: 'sourcing', sub: null, day: null },
  { t: 'Take one good action on each Hard-to-Crack company', s: 'sourcing', sub: null, day: null, origin: 'expanded',
    n: 'Fans out over the Affinity Hard-to-Crack view.' },

  // --- Jampack, rank 4 -----------------------------------------------------
  { t: 'Market outreach to larger CPG brands', s: 'diligence', sub: 'Jampack', day: '2026-08-27',
    n: 'Straight off the Matt Weiss CPG call at 9:00.', cal: 'matt-cpg-thu' },
  { t: 'Ping the expert networks on CPG', s: 'diligence', sub: 'Jampack', day: '2026-08-27' },

  // --- Investor networking -------------------------------------------------
  { t: 'Pull the investor shortlist from AS BD targets', s: 'investor', sub: null, day: '2026-08-24',
    origin: 'asked_for', n: 'Seed firms and firms relevant to Telescope. Needed before Tuesday.' },
  { t: 'Work the shortlist at the VC Summer Happy Hour', s: 'investor', sub: null, day: '2026-08-25',
    n: 'Anchored to the 16:30 event.' },

  // --- Market, future anchor ----------------------------------------------
  { t: 'Start outreach around InsureTech Connect, Vegas', s: 'market', sub: 'Life insurance',
    day: null, due: '2026-09-08', n: 'September conference. Not this week, but it cannot be forgotten.' },
];

// Captured live 2026-08-18. os_sync.js --calendar supersedes this.
const EVENTS = [
  ['seed-team-mon', 'Team meeting', '2026-08-24T09:30:00-07:00', '2026-08-24'],
  ['seed-duncan-mon', 'Duncan (Signal Lift)', '2026-08-24T10:00:00-07:00', '2026-08-24'],
  ['seed-mickey-mon', '1:1 Calvin / Mickey', '2026-08-24T15:30:00-07:00', '2026-08-24'],
  ['sync-chris-mon', 'Sync: Calvin / Chris', '2026-08-24T16:00:00-07:00', '2026-08-24'],
  ['seed-pentimenti-tue', 'Telescope / Pentimenti intro', '2026-08-25T08:30:00-07:00', '2026-08-25'],
  ['seed-insight-tue', 'Nick (Insight) chat', '2026-08-25T13:30:00-07:00', '2026-08-25'],
  ['seed-civ-tue', 'Mitchell (CIV) coffee', '2026-08-25T15:00:00-07:00', '2026-08-25'],
  ['seed-hh-tue', 'VC Summer Happy Hour', '2026-08-25T16:30:00-07:00', '2026-08-25'],
  ['seed-supersonik-wed', 'Telescope / Supersonik intro', '2026-08-26T09:00:00-07:00', '2026-08-26'],
  ['seed-chris-wed', 'Weekly 1:1 Calvin / Chris', '2026-08-26T14:00:00-07:00', '2026-08-26'],
  ['seed-modo-wed', 'Telescope / Modo intro', '2026-08-26T15:00:00-07:00', '2026-08-26'],
  ['matt-cpg-thu', 'Matt Weiss CPG chat', '2026-08-27T09:00:00-07:00', '2026-08-27'],
  ['seed-drive-thu', 'Drive to Santa Barbara', '2026-08-27T19:00:00-07:00', '2026-08-27'],
  ['seed-pipeline-fri', 'Pipeline: Calvin / Chris', '2026-08-28T15:30:00-07:00', '2026-08-28'],
];

(async () => {
  const apply = process.argv.includes('--apply');
  const c = await connect();

  const plan = [];
  const run = async (sql, args) => { if (apply) return c.query(sql, args); return { rows: [] }; };

  // Markets
  for (const m of MARKETS) {
    plan.push(`market: ${m.name}`);
    await run(`insert into os_market (name, thesis) values ($1,$2)
               on conflict (name) do update set thesis = excluded.thesis`, [m.name, m.thesis]);
  }

  // Priorities. Deactivate the old order first so the unique rank index is free.
  plan.push(`priorities: ${PRIORITIES.map(p => `${p.rank} ${p.label}`).join(', ')}`);
  await run('update os_priority set active = false where active');
  for (const p of PRIORITIES) {
    const co = p.kind === 'company'
      ? (await (apply ? c.query('select id from company where lower(name) = lower($1) limit 1', [p.label]) : { rows: [] })).rows[0]
      : null;
    await run(`insert into os_priority (rank, label, kind, stream, company_id, note, active)
               values ($1,$2,$3,$4,$5,$6,true)`,
      [p.rank, p.label, p.kind, p.stream || null, co ? co.id : null, p.note || null]);
    if (p.kind === 'company') plan.push(`  ${p.label} -> ${co ? 'linked to company #' + co.id : 'no company row, label only'}`);
  }

  // Calendar (seed only; the sync replaces it)
  plan.push(`calendar: ${EVENTS.length} seeded events`);
  for (const [id, summary, starts, day] of EVENTS) {
    await run(`insert into os_calendar_event (external_id, summary, starts_at, day)
               values ($1,$2,$3,$4)
               on conflict (external_id) do update set
                 summary = excluded.summary, starts_at = excluded.starts_at, day = excluded.day`,
      [id, summary, starts, day]);
  }

  // The week
  plan.push(`week: ${WEEK} (status active)`);
  const w = await run(`insert into os_week (week_of, status, intent) values ($1,'active',$2)
                       on conflict (week_of) do update set intent = excluded.intent, status = 'active'
                       returning id`, [WEEK, INTENT]);
  const weekId = w.rows[0]?.id;

  // Tasks. Replace this week's seeded set rather than appending on a re-run.
  if (apply) await c.query('delete from os_task where week_id = $1', [weekId]);
  plan.push(`tasks: ${TASKS.length}`);
  let sort = 0;
  for (const t of TASKS) {
    const isMarket = MARKETS.some(m => m.name === t.sub);
    let companyId = null, marketId = null;
    if (apply && t.sub) {
      if (isMarket) {
        marketId = (await c.query('select id from os_market where name = $1', [t.sub])).rows[0]?.id ?? null;
      } else {
        companyId = (await c.query('select id from company where lower(name) = lower($1) limit 1', [t.sub])).rows[0]?.id ?? null;
      }
    }
    await run(`insert into os_task
        (title, notes, stream, subject_kind, subject_label, company_id, market_id,
         week_id, day, due_on, calendar_ref, origin, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [t.t, t.n || null, t.s,
       t.sub ? (isMarket ? 'market' : 'company') : 'none',
       t.sub || null, companyId, marketId,
       weekId, t.day || null, t.due || null, t.cal || null, t.origin || 'calvin', sort++]);
    plan.push(`  ${(t.day || t.due || 'no day').padEnd(11)} [${t.s}] ${t.sub ? t.sub + ': ' : ''}${t.t}`);
  }

  console.log(plan.join('\n'));
  console.log(apply ? '\napplied.' : '\nreport only. re-run with --apply');
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
