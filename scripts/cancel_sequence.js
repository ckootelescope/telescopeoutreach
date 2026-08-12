// Kill every live cadence for a company and record why. Cancels the pending
// steps in Supabase and the matching entries in followups.json together, so the
// scheduler cannot resurrect a sequence the database thinks is dead.
//
//   node scripts/cancel_sequence.js <domain> "<reason>" [--status=passed] [--apply]
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const domain = args[0];
const reason = args[1] || 'cancelled by Calvin';
const statusArg = (process.argv.find(a => a.startsWith('--status=')) || '').split('=')[1];

async function main() {
  if (!domain) { console.error('usage: cancel_sequence.js <domain> "<reason>" [--status=passed] [--apply]'); process.exit(1); }
  const c = await connect();

  const co = await c.query(
    `select co.id, co.name, co.status from company co
      left join company_domain d on d.company_id = co.id
      where co.primary_domain = $1 or d.domain = $1 limit 1`, [domain]);
  if (!co.rows.length) { console.error('no company for ' + domain); await c.end(); process.exit(1); }
  const { id: companyId, name } = co.rows[0];

  const seqs = await c.query(
    `select q.id, q.round, q.kind, q.status, ct.email,
            (select count(*) from step s where s.sequence_id = q.id and s.status in ('planned','drafted')) open
       from sequence q join contact ct on ct.id = q.contact_id
      where q.company_id = $1 order by q.round`, [companyId]);

  console.log(name + ' (' + domain + ')  status=' + co.rows[0].status);
  seqs.rows.forEach(s => console.log('  R' + s.round + ' ' + s.kind.padEnd(7) + ' ' + s.status.padEnd(16) +
    ' ' + s.email + '  ' + s.open + ' step(s) still open'));
  const live = seqs.rows.filter(s => Number(s.open) > 0 || ['active', 'needs_scheduling'].includes(s.status));
  console.log('sequences to cancel: ' + live.length);
  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  for (const s of live.map(x => x.id)) {
    await c.query(`update step set status='cancelled' where sequence_id=$1 and status in ('planned','drafted')`, [s]);
    await c.query(`update sequence set status='cancelled', ended_on=current_date where id=$1`, [s]);
  }
  await c.query(`insert into prior_check (company_id, source, verdict, detail)
                 values ($1,'manual','blocked',$2)`, [companyId, reason]);
  if (statusArg) await c.query(`update company set status=$2, note=$3 where id=$1`, [companyId, statusArg, reason]);

  const emails = new Set(seqs.rows.map(s => String(s.email).toLowerCase()));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'followups.json'), 'utf8'));
  let stopped = 0;
  cfg.pending.forEach(e => {
    if (e.status === 'pending' && (emails.has(String(e.email).toLowerCase()) ||
        String(e.domain || '').toLowerCase() === domain)) {
      e.status = 'cancelled'; e.processedAt = new Date().toISOString(); stopped++;
    }
  });
  fs.writeFileSync(path.join(ROOT, 'followups.json'), JSON.stringify(cfg, null, 2));

  console.log(JSON.stringify({ company: name, sequences_cancelled: live.length,
    followups_entries_cancelled: stopped, company_status: statusArg || co.rows[0].status }, null, 1));
  await c.end();
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
