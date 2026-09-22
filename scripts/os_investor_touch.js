// Roll held investor meetings forward into os_investor_target.last_outreach.
//
//   node scripts/os_investor_touch.js            report only
//   node scripts/os_investor_touch.js --apply    write
//
// The investor tab decides its queues from last_outreach: someone with a null
// date is 'net_new' no matter how recently Calvin sat across a table from them.
// Meetings land in os_calendar_event and get a category from os_meeting_brief,
// but nothing carried the two together, so the tab kept showing people as never
// contacted the week after the coffee.
//
// A meeting in the past counts as held. The console's done/scheduled toggle is
// a manual tick that is often never made, so it is not evidence of anything;
// the date is.
//
// Matching is deliberately strict. A brief carries a firm as Calvin writes it
// ("NVP", "Citi") and a first name ("Owen"), while the target row carries the
// legal-ish firm ("Norwest", "Citi Ventures") and a full name. A row is only
// touched when the firm matches on its distinguishing token AND the person
// matches on a name part. Everything else is printed as unmatched for a human,
// because writing the wrong date onto the wrong investor is worse than leaving
// the queue stale.

const { connect } = require('./db');

const APPLY = process.argv.includes('--apply');

// Words that carry no signal when comparing two firm names.
const NOISE = new Set(['ventures', 'venture', 'capital', 'partners', 'group', 'the',
  'management', 'holdings', 'fund', 'funds', 'vc', 'llc', 'lp', 'inc', 'co',
  'equity', 'growth', 'investments']);

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = s => norm(s).split(' ').filter(w => w && !NOISE.has(w));

/** One substitution, insertion or deletion apart. "Tau" is "Tao" with a typo. */
function within1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Do two firm names share their distinguishing token, or is one a prefix of the other? */
function firmMatch(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  // A typo in one of them should not cost a match, but only on a token long
  // enough that being one edit apart still means something.
  if (ta.some(w => tb.some(v => w === v || (w.length >= 3 && within1(w, v))))) return true;
  // "NVP" vs "Norwest Venture Partners": an acronym against the initials.
  const initials = t => t.map(w => w[0]).join('');
  const acro = (x, y) => x.length === 1 && x[0].length >= 2 && x[0] === initials(y);
  return acro(ta, tb) || acro(tb, ta);
}

/** Does the counterpart on the invite look like the person on the target row? */
function nameMatch(counterpart, name) {
  const a = norm(counterpart).split(' ').filter(Boolean);
  const b = norm(name).split(' ').filter(Boolean);
  if (!a.length || !b.length) return false;
  if (a[0] === b[0]) return true;                       // Owen / Owen Chun
  // Nick / Nicholas, and the other way round.
  return a.some(x => b.some(y => x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))));
}

const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

(async () => {
  const c = await connect();

  const meets = (await c.query(`
    select m.day, m.org, m.counterpart, m.summary, m.attendees
      from v_os_meeting m
     where m.category = 'investor'
       and m.day <= (now() at time zone 'America/Los_Angeles')::date
     order by m.day`)).rows;

  const targets = (await c.query(`
    select id, name, firm, relationship, last_outreach, email from os_investor_target
     where status <> 'skip'`)).rows;

  // Latest held meeting per target.
  const best = new Map();          // target id -> { day, meeting }
  const unmatched = [];
  const ambiguous = [];

  for (const m of meets) {
    // An attendee address that is the target's own address settles it, and
    // settles it better than any name or firm string can: "NVP" and "Norwest"
    // never look alike, but ochun@nvp.com is on both records.
    const invited = new Set((m.attendees || []).map(a => String(a).toLowerCase()));
    const byEmail = targets.filter(t => t.email && invited.has(String(t.email).toLowerCase()));

    const hits = byEmail.length ? byEmail : targets.filter(t =>
      firmMatch(m.org, t.firm) && (!m.counterpart || nameMatch(m.counterpart, t.name)));

    if (hits.length === 0) { unmatched.push(m); continue; }
    if (hits.length > 1) { ambiguous.push({ m, hits }); continue; }

    const t = hits[0];
    const prev = best.get(t.id);
    if (!prev || prev.day < m.day) best.set(t.id, { day: m.day, meeting: m, target: t });
  }

  const updates = [];
  for (const { day, meeting, target } of best.values()) {
    const cur = target.last_outreach;
    if (cur && iso(cur) >= iso(day)) continue;           // already at least this fresh
    updates.push({ target, day, meeting, from: cur });
  }

  console.log(`investor meetings in the past: ${meets.length}`);
  console.log(`targets on file: ${targets.length}`);
  console.log(`\nlast_outreach to move forward: ${updates.length}`);
  for (const u of updates) {
    const rel = ['none', 'cold', null].includes(u.target.relationship) ? "  relationship -> active" : '';
    console.log(`  ${String(u.target.name).padEnd(18)} ${String(u.target.firm).slice(0, 24).padEnd(25)} ` +
                `${u.from ? iso(u.from) : 'never'} -> ${iso(u.day)}${rel}`);
    console.log(`      from: ${String(u.meeting.summary).slice(0, 62)}`);
  }

  if (ambiguous.length) {
    console.log(`\nambiguous, left alone: ${ambiguous.length}`);
    for (const a of ambiguous) {
      console.log(`  ${iso(a.m.day)} ${a.m.org} / ${a.m.counterpart || '-'} matched ` +
                  a.hits.map(h => `${h.name} (${h.firm})`).join(' | '));
    }
  }

  if (unmatched.length) {
    console.log(`\nno target row, left alone: ${unmatched.length}`);
    for (const m of unmatched) {
      console.log(`  ${iso(m.day)} ${String(m.org || '-').padEnd(24)} ${m.counterpart || '-'}`);
    }
  }

  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  let n = 0;
  for (const u of updates) {
    await c.query(
      `update os_investor_target
          set last_outreach = $1,
              relationship = case when coalesce(relationship, 'none') in ('none', 'cold')
                                  then 'active' else relationship end,
              updated_at = now()
        where id = $2`, [iso(u.day), u.target.id]);
    n++;
  }
  console.log(`\napplied. ${n} target(s) updated.`);
  await c.end();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
