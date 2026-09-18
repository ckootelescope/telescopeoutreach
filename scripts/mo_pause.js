#!/usr/bin/env node
/**
 * Push a contact's remaining steps out by N days.  See market-outreach/SPEC.md
 *
 *   node scripts/mo_pause.js --days=4 <email|name> [<email|name> ...]
 *   node scripts/mo_pause.js --days=4 anna.patrick@integrity.com --apply
 *
 * For when a contact needs to go quiet without leaving the sequence: a
 * duplicate send, a bad-timing reply, a conference week. Relative gaps between
 * the remaining steps are preserved, and nothing is ever scheduled into the
 * past, so a contact who has fallen behind does not get two follow-ups at once
 * when they resume.
 *
 * Cancel outright with a status change instead; this is a delay, not an exit.
 */
const { connect } = require('./db');

const APPLY = process.argv.includes('--apply');
const daysArg = process.argv.find(a => a.startsWith('--days='));
const DAYS = daysArg ? Number(daysArg.slice(7)) : 4;

async function main() {
  const who = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!who.length) { console.error('usage: mo_pause.js --days=N <email|name> [...] [--apply]'); process.exit(1); }
  if (!Number.isInteger(DAYS) || DAYS < 1 || DAYS > 90) { console.error('--days must be 1-90'); process.exit(1); }

  const c = await connect();
  const rows = (await c.query(`
    select ct.id, ct.full_name, ct.email, ct.status,
           (select count(*) from market.step s where s.contact_id = ct.id and s.status = 'planned') planned,
           (select min(s.due_date)::text from market.step s where s.contact_id = ct.id and s.status = 'planned') next_due
      from market.contact ct
     where lower(ct.email) = any($1::text[]) or lower(ct.full_name) = any($1::text[])
     order by ct.full_name`, [who.map(w => w.toLowerCase())])).rows;

  const missing = who.filter(w => !rows.some(r =>
    String(r.email || '').toLowerCase() === w.toLowerCase() ||
    r.full_name.toLowerCase() === w.toLowerCase()));
  if (missing.length) console.log('no such contact: ' + missing.join(', '));
  if (!rows.length) { await c.end(); return; }

  console.log('pausing ' + rows.length + ' contact(s) by ' + DAYS + ' day(s):');
  for (const r of rows) {
    const steps = (await c.query(
      `select step_no, due_date::text d from market.step
        where contact_id = $1 and status = 'planned' order by step_no`, [r.id])).rows;
    console.log('  ' + r.full_name.padEnd(22) + r.status.padEnd(10) + steps.length + ' planned');
    steps.forEach(s => console.log('      E' + s.step_no + '  ' + s.d + '  ->  ' +
      new Date(Date.parse(s.d + 'T12:00:00Z') + DAYS * 864e5).toISOString().slice(0, 10)));
  }

  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  // greatest(): a step already in the past must not stay there, or it fires the
  // instant the pause is applied, which is the opposite of pausing.
  const r = await c.query(
    `update market.step set due_date = greatest(due_date + $2::int, pt_today() + $2::int)
      where contact_id = any($1::bigint[]) and status = 'planned' returning id`,
    [rows.map(x => x.id), DAYS]);
  console.log('\npushed ' + r.rowCount + ' step(s) out by ' + DAYS + ' days');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
