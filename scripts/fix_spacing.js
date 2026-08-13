// Enforce cadence spacing on live sequences. Re-anchoring an individual step
// only fixes that step, so a later one can still sit on top of it: a founder
// then gets Email 3 and Email 4 the same morning, which reads as a bug to them
// and burns the last touch of the cadence.
//
// Walks steps 2..4 in order. Any step due on or before the one before it gets
// pushed out by the proper gap for its engine.
//
//   node scripts/fix_spacing.js            report only
//   node scripts/fix_spacing.js --apply
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const GAP = { first: { 2: 2, 3: 5, 4: 5 }, restart: { 2: 2, 3: 3, 4: 5 } };
const TODAY = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

async function main() {
  const c = await connect();
  const rows = await c.query(`
    select q.id seq_id, q.kind, co.name company, ct.email,
           s.id step_id, s.step_no, s.status, s.due_date::text due, s.sent_at::date::text sent
      from sequence q
      join company co on co.id = q.company_id
      join contact ct on ct.id = q.contact_id
      join step s on s.sequence_id = q.id
     where q.status = 'active' and s.status not in ('cancelled','skipped')
     order by q.id, s.step_no`);

  const bySeq = new Map();
  rows.rows.forEach(r => {
    if (!bySeq.has(r.seq_id)) bySeq.set(r.seq_id, []);
    bySeq.get(r.seq_id).push(r);
  });

  const moves = [];
  for (const steps of bySeq.values()) {
    // a sent step is a fact and anchors everything after it; a planned one is
    // only a plan and can move
    let prev = null;
    for (const s of steps) {
      const on = s.sent || s.due;
      if (prev && s.status === 'planned' && on <= prev) {
        const want = addDays(prev, GAP[s.kind][s.step_no] || 2);
        const due = want < TODAY ? TODAY : want;
        moves.push({ ...s, from: s.due, to: due });
        prev = due;
      } else {
        prev = on;
      }
    }
  }

  console.log('steps landing on or before the step before them: ' + moves.length);
  moves.forEach(m => console.log('  ' + m.company.padEnd(18) + ' E' + m.step_no +
    '  ' + m.from + ' -> ' + m.to));
  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  for (const m of moves) await c.query(`update step set due_date=$2 where id=$1`, [m.step_id, m.to]);

  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'followups.json'), 'utf8'));
  const want = new Map(moves.map(m => [String(m.email).toLowerCase() + '#' + m.step_no, m.to]));
  let synced = 0;
  cfg.pending.forEach(e => {
    const k = String(e.email).toLowerCase() + '#' + e.emailNumber;
    if (e.status === 'pending' && want.has(k) && e.sendDate !== want.get(k)) {
      e.sendDate = want.get(k); synced++;
    }
  });
  fs.writeFileSync(path.join(ROOT, 'followups.json'), JSON.stringify(cfg, null, 2));

  console.log(JSON.stringify({ steps_moved: moves.length, followups_entries_synced: synced }, null, 1));
  await c.end();
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
