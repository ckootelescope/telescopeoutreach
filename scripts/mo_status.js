#!/usr/bin/env node
/**
 * Market outreach status.  See market-outreach/SPEC.md
 *
 *   node scripts/mo_status.js                 every project
 *   node scripts/mo_status.js pathwork        one project, contact by contact
 */
const { connect } = require('./db');

async function main() {
  const c = await connect();
  const slug = process.argv.slice(2).find(a => !a.startsWith('--'));

  if (!slug) {
    const r = await c.query(`select * from market.v_project_status order by slug`);
    if (!r.rows.length) { console.log('no market outreach projects yet'); return c.end(); }
    console.table(r.rows);

    const due = await c.query(`select project_slug, count(*)::int n, min(due_date)::text next
       from market.v_due group by project_slug order by 1`);
    console.log('\ndue now:');
    if (!due.rows.length) console.log('  nothing');
    else due.rows.forEach(d => console.log('  ' + d.project_slug.padEnd(16) + d.n + ' step(s), earliest ' + d.next));

    const nudge = await c.query(`select count(*)::int n from market.nudge where status='queued'`);
    if (nudge.rows[0].n) console.log('\nLinkedIn nudge drafts waiting in your inbox: ' + nudge.rows[0].n);

    const fail = await c.query(`select ct.full_name, s.step_no, s.fail_reason
       from market.step s join market.contact ct on ct.id = s.contact_id where s.status='failed'`);
    if (fail.rows.length) {
      console.log('\nFAILED SENDS (' + fail.rows.length + ')');
      fail.rows.forEach(f => console.log('  ' + f.full_name.padEnd(22) + 'E' + f.step_no + '  ' + f.fail_reason));
    }
    return c.end();
  }

  const p = await c.query(`select * from market.project where slug=$1`, [slug]);
  if (!p.rows.length) { console.log('no project ' + slug); return c.end(); }
  const proj = p.rows[0];
  console.log(proj.anchor_company + '  (' + proj.slug + ')   status ' + proj.status);
  console.log('subject: Telescope Partners | Chat on ' + (proj.industry_label || proj.industry) + ' Software and AI Tools\n');

  const r = await c.query(`
    select ct.full_name, ct.company_name, ct.angle, ct.method, ct.status, ct.email,
           (select count(*) from market.step s where s.contact_id=ct.id and s.status='sent') sent,
           (select max(s.sent_at)::date::text from market.step s where s.contact_id=ct.id and s.status='sent') last_sent,
           (select min(s.due_date)::text from market.step s where s.contact_id=ct.id and s.status='planned') next_due
      from market.contact ct where ct.project_id=$1
     order by case ct.status when 'booked' then 0 when 'replied' then 1 when 'active' then 2
                             when 'bounced' then 3 when 'manual' then 4 else 5 end, ct.full_name`,
    [proj.id]);
  console.table(r.rows);

  const nav = r.rows.filter(x => x.method === 'salesnav');
  if (nav.length) console.log(nav.length + ' contact(s) are SalesNav-only and were never emailed.');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
