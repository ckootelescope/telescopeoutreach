#!/usr/bin/env node
/**
 * Export every contact on a market-outreach project to CSV.
 * See market-outreach/SPEC.md
 *
 *   node scripts/mo_export.js <slug>              prints the path it wrote
 *   node scripts/mo_export.js <slug> --stdout     dump to the terminal instead
 *
 * The per-batch CSV that mo_enrich writes covers one run. This is the whole
 * project in one file: who is on it, how they are being reached, where their
 * sequence has got to, and whether a LinkedIn draft is waiting.
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const STDOUT = process.argv.includes('--stdout');
const cell = v => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

async function main() {
  const slug = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!slug) { console.error('usage: mo_export.js <project-slug> [--stdout]'); process.exit(1); }
  const c = await connect();

  const pr = await c.query(`select * from market.project where slug=$1`, [slug]);
  if (!pr.rows.length) { console.error('no project ' + slug); await c.end(); process.exit(1); }
  const project = pr.rows[0];

  const rows = (await c.query(`
    select ct.full_name, ct.title, ct.company_name, ct.angle, ct.method, ct.status,
           ct.email, ct.email_status, ct.gate_reason, ct.linkedin_url,
           (select min(s.sent_at)::date from market.step s
             where s.contact_id = ct.id and s.step_no = 1 and s.status = 'sent') e1_sent,
           (select count(*) from market.step s
             where s.contact_id = ct.id and s.status = 'sent') steps_sent,
           (select min(s.due_date) from market.step s
             where s.contact_id = ct.id and s.status = 'planned') next_due,
           (select max(e.sent_at)::date from market.event e
             where e.contact_id = ct.id and e.direction = 'in' and e.kind = 'reply') replied_on,
           n.status nudge_status
      from market.contact ct
      left join market.nudge n on n.contact_id = ct.id
     where ct.project_id = $1
     order by ct.angle, ct.company_name nulls last, ct.full_name`, [project.id])).rows;

  const header = ['Name', 'Title', 'Company', 'Angle', 'Method of Contact', 'Status',
    'Email', 'Email Status', 'Why Not Emailed', 'LinkedIn URL',
    'Email 1 Sent', 'Steps Sent', 'Next Due', 'Replied On', 'LinkedIn Draft'];

  const line = r => [
    r.full_name, r.title, r.company_name, r.angle,
    r.method === 'email' ? 'Email' : 'SalesNav', r.status,
    r.email, r.email_status,
    r.method === 'salesnav' ? r.gate_reason : '',
    r.linkedin_url,
    r.e1_sent ? String(r.e1_sent).slice(0, 10) : '',
    r.steps_sent,
    r.next_due ? String(r.next_due).slice(0, 10) : '',
    r.replied_on ? String(r.replied_on).slice(0, 10) : '',
    r.nudge_status || 'none',
  ].map(cell).join(',');

  const csv = [header.join(','), ...rows.map(line)].join('\n') + '\n';

  if (STDOUT) { console.log(csv); await c.end(); return; }

  const dir = path.join(ROOT, 'market-outreach', project.slug);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, project.slug + '-all-contacts.csv');
  fs.writeFileSync(p, csv);

  const by = k => rows.reduce((m, r) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {});
  console.log('wrote market-outreach/' + project.slug + '/' + path.basename(p) + '  (' + rows.length + ' contacts)');
  console.log('  by method :', by('method'));
  console.log('  by angle  :', by('angle'));
  console.log('  by status :', by('status'));
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
