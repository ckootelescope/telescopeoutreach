#!/usr/bin/env node
/**
 * Open a diligence market-outreach project and freeze its copy blocks.
 * See market-outreach/SPEC.md
 *
 *   node scripts/mo_project.js <file.json>            report only
 *   node scripts/mo_project.js <file.json> --apply
 *   node scripts/mo_project.js --list
 *   node scripts/mo_project.js --show <slug>
 *
 * Input:
 * {
 *   "anchor_company": "Jampack AI",
 *   "slug": "jampack-ai",
 *   "industry": "CPG",
 *   "workflow": "their O2C workflow",
 *   "fu3_insight_html": "<the step-4 insight paragraph>",
 *   "blocks": [
 *     {
 *       "angle": "customer",
 *       "para1_s2": "your experience scaling [Company]'s operations and ...",
 *       "para2_html": "For context, I'm an investor at Telescope Partners ...",
 *       "uses_company_slot": true
 *     }
 *   ]
 * }
 *
 * Re-running with the same slug adds NEW angles and leaves existing ones alone.
 * A frozen block is never silently rewritten: pass --refreeze to replace one,
 * and understand that it only affects mail sent from that point on.
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const REFREEZE = process.argv.includes('--refreeze');
const ANGLES = ['customer', 'competitor', 'former', 'advisor', 'market_expert', 'other'];

// The anchor company must never reach a recipient. Copy is authored by Calvin,
// but a paste slip is cheap to catch here and expensive to catch in the mailbox.
function anchorLeak(p, block) {
  const needle = String(p.anchor_company || '').trim();
  if (needle.length < 3) return null;
  const hay = [block.para1_s2, block.para2_html, p.fu3_insight_html].join(' ');
  return new RegExp('\\b' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(hay)
    ? needle : null;
}

const DASH = /--|—|–/;

function validate(p) {
  const errs = [];
  for (const k of ['anchor_company', 'slug', 'industry', 'workflow']) {
    if (!String(p[k] || '').trim()) errs.push('missing ' + k);
  }
  if (p.slug && !/^[a-z0-9-]+$/.test(p.slug)) errs.push('slug must be lowercase alphanumeric with dashes');
  const blocks = p.blocks || [];
  if (!blocks.length) errs.push('at least one copy block is required');
  for (const b of blocks) {
    if (!ANGLES.includes(b.angle)) errs.push('bad angle: ' + b.angle);
    if (!String(b.para1_s2 || '').trim()) errs.push(b.angle + ': missing para1_s2');
    if (!String(b.para2_html || '').trim()) errs.push(b.angle + ': missing para2_html');
    const leak = anchorLeak(p, b);
    if (leak) errs.push(b.angle + ': ANCHOR COMPANY "' + leak + '" appears in the copy');
    if (DASH.test(b.para1_s2) || DASH.test(b.para2_html)) errs.push(b.angle + ': contains an em dash or --');
    if (b.uses_company_slot !== false && !/\[Company\]/.test(b.para2_html) && !/\[Company\]/.test(b.para1_s2)) {
      errs.push(b.angle + ': uses_company_slot is true but no [Company] slot found');
    }
  }
  if (p.fu3_insight_html && DASH.test(p.fu3_insight_html)) errs.push('fu3_insight_html contains an em dash or --');
  return errs;
}

async function list(c) {
  const r = await c.query(`select p.slug, p.anchor_company, p.industry, p.status,
      (select string_agg(b.angle, ', ' order by b.angle) from market.copy_block b where b.project_id = p.id) angles,
      (select count(*) from market.contact ct where ct.project_id = p.id) contacts
    from market.project p order by p.created_at desc`);
  if (!r.rows.length) return console.log('no projects yet');
  console.table(r.rows);
}

async function show(c, slug) {
  const p = await c.query(`select * from market.project where slug = $1`, [slug]);
  if (!p.rows.length) return console.log('no project with slug ' + slug);
  const row = p.rows[0];
  console.log('anchor   : ' + row.anchor_company + '   (never appears in any email)');
  console.log('industry : ' + row.industry);
  console.log('workflow : ' + row.workflow);
  console.log('status   : ' + row.status);
  console.log('subject  : Telescope Partners | Chat on ' + (row.industry_label || row.industry) + ' Software and AI Tools');
  const b = await c.query(`select angle, para1_s2, para2_html, uses_company_slot, frozen_on
     from market.copy_block where project_id = $1 order by angle`, [row.id]);
  for (const x of b.rows) {
    console.log('\n--- ' + x.angle + (x.frozen_on ? '  (frozen ' + String(x.frozen_on).slice(0, 10) + ')' : '') +
                (x.uses_company_slot ? '' : '  [no company slot]'));
    console.log('  p1s2: ' + x.para1_s2);
    console.log('  p2  : ' + x.para2_html.slice(0, 240) + (x.para2_html.length > 240 ? ' ...' : ''));
  }
  console.log('\nstep 4 insight: ' + (row.fu3_insight_html || '(not set - mo_send will refuse step 4)'));
}

async function main() {
  const c = await connect();
  const argv = process.argv.slice(2);

  if (argv.includes('--list')) { await list(c); return c.end(); }
  const si = argv.indexOf('--show');
  if (si >= 0) { await show(c, argv[si + 1]); return c.end(); }

  const src = argv.find(a => !a.startsWith('--'));
  if (!src) { console.error('usage: mo_project.js <file.json> [--apply] | --list | --show <slug>'); process.exit(1); }
  const p = JSON.parse(fs.readFileSync(path.isAbsolute(src) ? src : path.join(ROOT, src), 'utf8'));

  const errs = validate(p);
  if (errs.length) {
    console.error('REFUSING - fix these first:');
    errs.forEach(e => console.error('  - ' + e));
    await c.end();
    process.exit(1);
  }

  const ex = await c.query(`select id, anchor_company from market.project where slug = $1`, [p.slug]);
  const existing = ex.rows[0] || null;

  console.log((existing ? 'UPDATING' : 'CREATING') + ' project ' + p.slug);
  console.log('  anchor   : ' + p.anchor_company + '   (internal only)');
  console.log('  industry : ' + p.industry);
  console.log('  workflow : ' + p.workflow);
  console.log('  subject  : Telescope Partners | Chat on ' + (p.industry_label || p.industry) + ' Software and AI Tools');

  let frozen = [];
  if (existing) {
    frozen = (await c.query(`select angle from market.copy_block where project_id = $1`, [existing.id]))
      .rows.map(r => r.angle);
  }
  for (const b of p.blocks) {
    const isNew = !frozen.includes(b.angle);
    const verb = isNew ? 'add' : (REFREEZE ? 'REPLACE (--refreeze)' : 'skip, already frozen');
    console.log('  block ' + b.angle.padEnd(11) + ' -> ' + verb);
  }
  if (!p.fu3_insight_html) console.log('  NOTE: no fu3_insight_html; step 4 cannot be sent until it is set');

  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  await c.query('begin');
  let pid;
  if (existing) {
    pid = existing.id;
    await c.query(`update market.project set industry=$2, workflow=$3,
        industry_label = coalesce($5, industry_label),
        fu3_insight_html = coalesce($4, fu3_insight_html) where id=$1`,
      [pid, p.industry, p.workflow, p.fu3_insight_html || null, p.industry_label || null]);
  } else {
    pid = (await c.query(`insert into market.project (anchor_company, slug, industry, workflow, fu3_insight_html, industry_label)
      values ($1,$2,$3,$4,$5, coalesce($6, initcap($3))) returning id`,
      [p.anchor_company, p.slug, p.industry, p.workflow, p.fu3_insight_html || null, p.industry_label || null])).rows[0].id;
  }
  let added = 0, replaced = 0;
  for (const b of p.blocks) {
    const isNew = !frozen.includes(b.angle);
    if (!isNew && !REFREEZE) continue;
    await c.query(`insert into market.copy_block (project_id, angle, para1_s2, para2_html, uses_company_slot, frozen_on)
        values ($1,$2,$3,$4,$5, current_date)
      on conflict (project_id, angle) do update
        set para1_s2 = excluded.para1_s2, para2_html = excluded.para2_html,
            uses_company_slot = excluded.uses_company_slot, frozen_on = current_date`,
      [pid, b.angle, b.para1_s2, b.para2_html, b.uses_company_slot !== false]);
    isNew ? added++ : replaced++;
  }
  await c.query('commit');
  console.log('\nproject ' + pid + ': ' + added + ' block(s) added, ' + replaced + ' replaced');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
