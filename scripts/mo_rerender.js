#!/usr/bin/env node
/**
 * Re-render the staged copy for contacts whose first email has not gone out,
 * and optionally re-date their cadence.  See market-outreach/SPEC.md
 *
 *   node scripts/mo_rerender.js pathwork
 *   node scripts/mo_rerender.js pathwork --start=2026-09-22 --days=0,2,3,6 --apply
 *   node scripts/mo_rerender.js pathwork --batch=market-outreach/pathwork/2026-09-21-input.json
 *
 * --batch scopes the change to the LinkedIn URLs in one staging file, and
 * --invert scopes it to everyone else. Without them it hits every contact on
 * the project who has not been emailed, which is almost never what is meant
 * when the copy change came from one batch.
 *
 * Bodies and subjects are frozen onto market.step at staging time, so editing a
 * copy block or a project CTA afterwards changes nothing that is already
 * queued. This applies the change to the queue.
 *
 * It will only touch a contact with NO sent step. Once the first email is out,
 * the thread has a subject the recipient can see and the follow-ups reply into
 * it, so rewriting the subject there would put a different title on an existing
 * conversation. Those contacts are reported and skipped.
 */
const { connect } = require('./db');
const { render, subject: subjectOf, guard, toText } = require('./mo_render');

const APPLY = process.argv.includes('--apply');
const INVERT = process.argv.includes('--invert');
const arg = k => {
  const a = process.argv.find(x => x.startsWith('--' + k + '='));
  return a ? a.slice(k.length + 3) : null;
};

const addDays = (iso, n) =>
  new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

async function main() {
  const slug = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!slug) { console.error('usage: mo_rerender.js <project-slug> [--start=YYYY-MM-DD] [--days=0,2,3,6] [--apply]'); process.exit(1); }

  const start = arg('start');
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) { console.error('--start must be YYYY-MM-DD'); process.exit(1); }
  const days = arg('days') ? arg('days').split(',').map(Number) : null;
  if (days && (days.length !== 4 || days.some(d => !Number.isInteger(d) || d < 0))) {
    console.error('--days needs four non-negative integers, e.g. 0,2,3,6'); process.exit(1);
  }
  if (days && !start) { console.error('--days requires --start'); process.exit(1); }

  const batchFile = arg('batch');
  if (INVERT && !batchFile) { console.error('--invert requires --batch'); process.exit(1); }
  const normUrl = u => String(u || '')
    .replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').toLowerCase();
  let batchUrls = null;
  if (batchFile) {
    const j = JSON.parse(require('fs').readFileSync(batchFile, 'utf8'));
    batchUrls = new Set((j.contacts || []).map(x => normUrl(x.linkedin_url)));
    if (!batchUrls.size) { console.error('no linkedin_url entries in ' + batchFile); process.exit(1); }
  }

  const c = await connect();
  const pr = await c.query(`select * from market.project where slug = $1`, [slug]);
  if (!pr.rows.length) { console.error('no project ' + slug); await c.end(); process.exit(1); }
  const project = pr.rows[0];

  const blocks = {};
  for (const b of (await c.query(`select * from market.copy_block where project_id = $1`, [project.id])).rows) {
    blocks[b.angle] = b;
  }

  // per contact: a batch override beats the project one
  const subjectFor = ct => subjectOf(project, ct);
  console.log('project  : ' + project.anchor_company + '  (' + slug + ')');
  console.log('subject  : ' + subjectOf(project) + '   (per-contact overrides win)');
  console.log('cta      : ' + (project.cta_html || '(renderer default)'));
  if (start) console.log('re-dating: ' + days.map((d, i) => 'E' + (i + 1) + ' ' + addDays(start, d)).join('   '));

  // Anyone with a sent step is in a live thread. Report, never rewrite.
  const live = (await c.query(`
    select ct.full_name, count(*) filter (where s.status = 'sent') sent
      from market.contact ct join market.step s on s.contact_id = ct.id
     where ct.project_id = $1 group by ct.id, ct.full_name
    having count(*) filter (where s.status = 'sent') > 0`, [project.id])).rows;

  const rows = (await c.query(`
    select ct.* from market.contact ct
     where ct.project_id = $1
       and not exists (select 1 from market.step s where s.contact_id = ct.id and s.status = 'sent')
       and ct.status not in ('replied','booked','bounced','stopped')
     order by ct.method, ct.full_name`, [project.id])).rows
    .filter(ct => !batchUrls || (batchUrls.has(normUrl(ct.linkedin_url)) !== INVERT));

  if (batchFile) console.log('scope    : ' + (INVERT ? 'everyone NOT in ' : 'only ') + batchFile);
  console.log('\nin a live thread already, left alone: ' + live.length);
  console.log('not yet emailed, will be re-rendered : ' + rows.length);

  const plan = [], blocked = [];
  for (const ct of rows) {
    const block = blocks[ct.angle];
    if (!block) { blocked.push({ ct, why: 'no copy block for angle ' + ct.angle }); continue; }
    const bodies = {};
    let bad = null;
    for (const n of [1, 2, 3, 4]) {
      const html = render(n, project, block, ct);
      if (!html) { bad = 'E' + n + ' rendered empty'; break; }
      const g = guard(html, project);
      if (g.length) { bad = 'E' + n + ': ' + g.join('; '); break; }
      bodies[n] = html;
    }
    if (bad) { blocked.push({ ct, why: bad }); continue; }
    plan.push({ ct, bodies });
  }

  plan.forEach(p => console.log('  ' + p.ct.full_name.padEnd(24) + p.ct.angle.padEnd(14) + p.ct.method));
  if (blocked.length) {
    console.log('\nBLOCKED (' + blocked.length + ')');
    blocked.forEach(b => console.log('  ' + b.ct.full_name.padEnd(24) + b.why));
  }

  if (!APPLY) {
    if (plan.length) {
      console.log('\n--- preview: E1 to ' + plan[0].ct.full_name + ' ---');
      console.log('Subject: ' + subjectFor(plan[0].ct));
      console.log(toText(plan[0].bodies[1]));
    }
    console.log('\n(report only - pass --apply to write)');
    await c.end();
    return;
  }

  await c.query('begin');
  let n = 0;
  for (const p of plan) {
    for (const step of [1, 2, 3, 4]) {
      const sets = ['subject = $3', 'body_html = $4'];
      const params = [p.ct.id, step, subjectFor(p.ct), p.bodies[step]];
      if (start) { sets.push('due_date = $5'); params.push(addDays(start, days[step - 1])); }
      const r = await c.query(
        `update market.step set ${sets.join(', ')}
          where contact_id = $1 and step_no = $2 and status = 'planned'`, params);
      n += r.rowCount;
    }
  }
  await c.query('commit');
  console.log('\nrewrote ' + n + ' step(s) across ' + plan.length + ' contact(s)');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
