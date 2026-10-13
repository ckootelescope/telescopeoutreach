/**
 * Draft-vs-sent loop for Email 1 Block 2.
 *
 *   node scripts/block2_edits.js --log <slug> <file.json>   append drafted variants to logs/block2_drafts.jsonl
 *        file.json: {"company","domain","variants":["A text","B text","C text"],"pick":"A"}
 *   node scripts/block2_edits.js --report [--days 14]        compare logged drafts with the Block 2 that went out
 *
 * The report says which variant Calvin kept (if any), and shows word-level edits when he
 * rewrote it. Edits he makes repeatedly belong in references/block2-spec.md.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LOG = path.join(ROOT, 'logs', 'block2_drafts.jsonl');

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function similarity(a, b) {
  const A = norm(a).split(' '), B = new Set(norm(b).split(' '));
  if (!A.length) return 0;
  return A.filter(w => B.has(w)).length / Math.max(A.length, B.size);
}
/** Minimal word diff: words removed from the draft and words Calvin added. */
function wordDiff(draft, sent) {
  const d = norm(draft).split(' '), s = norm(sent).split(' ');
  const ds = new Set(d), ss = new Set(s);
  return { cut: [...new Set(d.filter(w => !ss.has(w)))], added: [...new Set(s.filter(w => !ds.has(w)))] };
}

function log(slug, file) {
  const j = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  const row = { slug, logged_at: new Date().toISOString(), ...j };
  fs.appendFileSync(LOG, JSON.stringify(row) + '\n');
  console.log('logged ' + slug + ' (' + (j.variants || []).length + ' variants, pick ' + j.pick + ')');
}

async function report(days) {
  const { connect } = require('./db');
  const { block2 } = require('./block2_check');
  if (!fs.existsSync(LOG)) return console.log('No drafts logged yet.');
  const since = Date.now() - days * 864e5;
  const rows = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    .filter(r => Date.parse(r.logged_at) >= since);
  const c = await connect();
  try {
    let kept = 0, edited = 0, rewritten = 0, unsent = 0;
    for (const r of rows) {
      const q = await c.query(
        `select st.body_html from step st join sequence s on s.id = st.sequence_id
           join company co on co.id = s.company_id left join company_domain d on d.company_id = co.id
          where st.step_no = 1 and s.kind = 'first' and st.sent_at is not null
            and (co.primary_domain = $1 or d.domain = $1)
          order by st.sent_at desc limit 1`, [r.domain]);
      if (!q.rows.length) { unsent++; console.log(`\n${r.company}: not sent yet`); continue; }
      const sent = block2(q.rows[0].body_html);
      const scored = (r.variants || []).map((v, i) => ({ i, v, sim: similarity(v, sent) }))
        .sort((a, b) => b.sim - a.sim);
      const best = scored[0];
      const label = best ? String.fromCharCode(65 + best.i) : '?';
      const verdict = !best || best.sim < 0.5 ? 'REWRITTEN' : best.sim > 0.95 ? 'KEPT' : 'EDITED';
      if (verdict === 'KEPT') kept++; else if (verdict === 'EDITED') edited++; else rewritten++;
      console.log(`\n${r.company}: ${verdict} (closest variant ${label}, similarity ${best ? best.sim.toFixed(2) : 0}, pick was ${r.pick})`);
      if (verdict !== 'KEPT') {
        const dd = wordDiff(best ? best.v : '', sent);
        console.log('  cut:   ' + dd.cut.slice(0, 25).join(' '));
        console.log('  added: ' + dd.added.slice(0, 25).join(' '));
        if (verdict === 'REWRITTEN') console.log('  sent:  ' + sent.replace(/\s+/g, ' '));
      }
    }
    console.log(`\n${rows.length} logged: ${kept} kept, ${edited} edited, ${rewritten} rewritten, ${unsent} not sent.`);
  } finally { await c.end(); }
}

if (require.main === module) (async () => {
  const a = process.argv.slice(2);
  if (a[0] === '--log') return log(a[1], a[2]);
  if (a[0] === '--report') { const i = a.indexOf('--days'); return report(i >= 0 ? Number(a[i + 1]) : 14); }
  console.log('usage: --log <slug> <file.json> | --report [--days N]');
})().catch(e => { console.error(e.message); process.exit(1); });
