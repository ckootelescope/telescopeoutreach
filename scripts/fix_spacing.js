// Re-space the remaining planned steps of every live cadence against the last
// email that actually went out.
//
// Why this is needed as a separate pass: mark_sent re-anchors at the moment it
// records a send, so a bug in that logic leaves rows that no later mark_sent run
// will revisit (the step is already 'sent', so it is no longer a hit). This is
// the repair tool for that, and a general invariant check: for a live sequence,
// step N+1 must fall GAP days after step N, counted from real send dates.
//
// It only ever pushes a step LATER. Pulling one earlier would fire an email
// ahead of the cadence Calvin designed.
//
//   node scripts/fix_spacing.js            report only
//   node scripts/fix_spacing.js --apply    write it
const path = require('path');
const { connect } = require('./db');

const APPLY = process.argv.includes('--apply');
// Round 1 is Day 0/+2/+7/+12, Round 2 is Day 0/+2/+5/+10, expressed as the gap
// from the previous step.
const GAP = { first: { 2: 2, 3: 5, 4: 5 }, restart: { 2: 2, 3: 3, 4: 5 } };

const addDays = (ymd, n) =>
  new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

async function main() {
  const c = await connect();

  const rows = (await c.query(`
    select q.id seq_id, q.kind, co.name company,
           s.id step_id, s.step_no, s.status, s.due_date::text due,
           s.sent_at::date::text sent
      from sequence q
      join company co on co.id = q.company_id
      join step s on s.sequence_id = q.id
     where q.status = 'active'
     order by co.name, s.step_no`)).rows;

  const bySeq = new Map();
  for (const r of rows) {
    if (!bySeq.has(r.seq_id)) bySeq.set(r.seq_id, []);
    bySeq.get(r.seq_id).push(r);
  }

  const fixes = [];
  for (const steps of bySeq.values()) {
    steps.sort((a, b) => a.step_no - b.step_no);
    // Anchor on the last step that really went out. Without a send there is
    // nothing to re-space against, so leave the sequence alone.
    const sent = steps.filter(s => s.status === 'sent' && s.sent);
    if (!sent.length) continue;
    const last = sent[sent.length - 1];
    let anchor = last.sent;
    for (let n = last.step_no + 1; n <= 4; n++) {
      const st = steps.find(s => s.step_no === n);
      if (!st) break;
      const gap = GAP[st.kind || steps[0].kind] ? GAP[steps[0].kind][n] : null;
      if (!gap) break;
      anchor = addDays(anchor, gap);
      if (st.status !== 'planned') continue;         // drafted/sent: leave it
      if (st.due < anchor) {
        fixes.push({ ...st, company: st.company, from: st.due, to: anchor });
      } else {
        anchor = st.due;                              // already later; chain off it
      }
    }
  }

  console.log('live sequences checked: ' + bySeq.size);
  console.log('planned steps mis-spaced: ' + fixes.length);
  fixes.forEach(f => console.log(
    `  ${f.company.padEnd(16)} E${f.step_no}  ${f.from} -> ${f.to}`));

  if (!fixes.length) { console.log('\nnothing to do'); await c.end(); return; }
  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  await c.query('begin');
  try {
    for (const f of fixes) {
      await c.query(`update step set due_date=$2 where id=$1 and status='planned'`,
        [f.step_id, f.to]);
    }
    await c.query('commit');
  } catch (e) { await c.query('rollback'); throw e; }

  const left = await c.query(`select spacing_violations from an_trust`);
  console.log(JSON.stringify({ steps_respaced: fixes.length,
    spacing_violations_remaining: left.rows[0].spacing_violations }, null, 1));
  await c.end();
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
