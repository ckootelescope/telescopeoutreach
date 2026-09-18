#!/usr/bin/env node
/**
 * Apply the email quality gate to an Apollo-enriched batch, write the batch CSV,
 * and stage contacts and their 4 steps. Nothing is sent here: mo_send does that.
 * See market-outreach/SPEC.md
 *
 *   node scripts/mo_enrich.js <batch.json>            report only
 *   node scripts/mo_enrich.js <batch.json> --apply
 *   node scripts/mo_enrich.js <batch.json> --apply --start=2026-09-17
 *
 * Apollo runs through MCP in the /marketoutreach command, not here: there is no
 * Apollo API key in .env and the credit spend belongs with the human-facing
 * step. This script takes the raw match output so the gate stays deterministic,
 * re-runnable and testable without spending a credit twice.
 *
 * Input:
 * {
 *   "project": "pathwork",
 *   "contacts": [
 *     { "linkedin_url": "...", "angle": "customer",
 *       "company_name": "John Hancock",          // optional [Company] override
 *       "apollo": { "first_name": "...", "last_name": "...", "title": "...",
 *                   "email": "...", "email_status": "verified",
 *                   "organization_name": "...", "organization_domain": "...",
 *                   "id": "..." } }
 *   ]
 * }
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');
const { render, subject, guard, toText } = require('./mo_render');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const startArg = process.argv.find(a => a.startsWith('--start='));
const OFFSETS = [0, 2, 5, 7];          // day 0 / 2 / 5 / 7

const ROLE = /^(info|contact|hello|sales|support|admin|team|help|press|careers|jobs|marketing|noreply|no-reply)@/i;

const norm = d => String(d || '').toLowerCase().replace(/^www\./, '').trim();
/** acme.com matches mail.acme.com and vice versa, but not acme.com.evil.com */
const domainMatches = (a, b) => {
  a = norm(a); b = norm(b);
  if (!a || !b) return false;
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
};
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const csvCell = v => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/**
 * The gate. All three must pass to auto-send. Anything else is routed to
 * SalesNav rather than dropped, because a bad guess sent automatically is much
 * worse than a manual InMail.
 */
function gate(a, raw) {
  // An explicit human decision outranks the automated checks. Recorded with the
  // real reason rather than by deleting the email, so the record does not later
  // read as "Apollo had nothing" and invite someone to re-enrich and send.
  if (raw && raw.force_salesnav) {
    return { method: 'salesnav', reason: String(raw.force_salesnav) };
  }
  const email = String(a.email || '').trim().toLowerCase();
  if (!email) return { method: 'salesnav', reason: 'no email from Apollo' };
  if (ROLE.test(email)) return { method: 'salesnav', reason: 'role address' };
  const status = String(a.email_status || '').toLowerCase();
  if (status !== 'verified') return { method: 'salesnav', reason: 'email_status=' + (status || 'unknown') };
  const eDom = email.split('@')[1];
  const oDom = a.organization_domain;
  if (!oDom) return { method: 'salesnav', reason: 'no employer domain to verify against' };
  if (!domainMatches(eDom, oDom)) {
    return { method: 'salesnav', reason: 'email domain ' + eDom + ' != employer ' + norm(oDom) };
  }
  return { method: 'email', reason: 'verified, domain matches employer' };
}

async function main() {
  const src = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!src) { console.error('usage: mo_enrich.js <batch.json> [--apply] [--start=YYYY-MM-DD]'); process.exit(1); }
  const batch = JSON.parse(fs.readFileSync(path.isAbsolute(src) ? src : path.join(ROOT, src), 'utf8'));
  const c = await connect();

  const pr = await c.query(`select * from market.project where slug = $1`, [batch.project]);
  if (!pr.rows.length) { console.error('no project with slug ' + batch.project); await c.end(); process.exit(1); }
  const project = pr.rows[0];

  const blocks = {};
  for (const b of (await c.query(`select * from market.copy_block where project_id = $1`, [project.id])).rows) {
    blocks[b.angle] = b;
  }

  const today = (await c.query('select pt_today()::text t')).rows[0].t;
  const start = startArg ? startArg.slice(8) : today;

  const rows = [];
  for (const raw of batch.contacts) {
    const a = raw.apollo || {};
    const full = String(a.name || [a.first_name, a.last_name].filter(Boolean).join(' ')).trim();
    const first = String(a.first_name || full.split(/\s+/)[0] || '').trim();
    const angle = raw.angle || 'customer';
    const block = blocks[angle];
    const g = gate(a, raw);

    // Prior contact on ANY project. Allowed (Calvin's call), surfaced anyway.
    let prior = '';
    if (a.email) {
      const p = await c.query(`select p.anchor_company, ct.created_at::date d
          from market.contact ct join market.project p on p.id = ct.project_id
         where lower(ct.email) = lower($1) and ct.project_id <> $2
         order by ct.created_at desc limit 1`, [a.email, project.id]);
      if (p.rows.length) prior = p.rows[0].anchor_company + ' ' + String(p.rows[0].d).slice(0, 10);
    }
    const dup = a.email ? (await c.query(
      `select 1 from market.contact where project_id=$1 and lower(email)=lower($2)`,
      [project.id, a.email])).rowCount > 0 : false;

    rows.push({
      full_name: full, first_name: first, title: a.title || '',
      company_name: raw.company_name || a.organization_name || '',
      company_domain: a.organization_domain || '',
      linkedin_url: raw.linkedin_url, angle,
      email: a.email || null, email_status: a.email_status || null,
      method: g.method, gate_reason: g.reason, apollo_id: a.id || null,
      prior, dup, block, missingBlock: !block,
    });
  }

  // ---------------------------------------------------------------- report
  const mail = rows.filter(r => r.method === 'email' && !r.dup && !r.missingBlock);
  const nav = rows.filter(r => r.method === 'salesnav' && !r.dup);
  const skipped = rows.filter(r => r.dup);
  const noBlock = rows.filter(r => r.missingBlock && !r.dup);

  console.log('project  : ' + project.anchor_company + '  (' + project.slug + ')');
  console.log('subject  : ' + subject(project));
  console.log('cadence  : day ' + OFFSETS.join(' / ') + '   starting ' + start);
  console.log('');
  console.log('WILL EMAIL (' + mail.length + ')');
  mail.forEach(r => console.log('  ' + r.full_name.padEnd(24) + r.email.padEnd(34) + r.angle.padEnd(11) +
    (r.prior ? '  [prior: ' + r.prior + ']' : '')));
  console.log('\nSALESNAV, no email sent (' + nav.length + ')');
  nav.forEach(r => console.log('  ' + r.full_name.padEnd(24) + (r.email || '-').padEnd(34) + r.gate_reason));
  if (noBlock.length) {
    console.log('\nNO COPY BLOCK for this angle - cannot stage (' + noBlock.length + ')');
    noBlock.forEach(r => console.log('  ' + r.full_name.padEnd(24) + 'angle=' + r.angle));
    console.log('  -> add the block with mo_project.js before these can be staged');
  }
  if (skipped.length) {
    console.log('\nALREADY ON THIS PROJECT, skipped (' + skipped.length + ')');
    skipped.forEach(r => console.log('  ' + r.full_name.padEnd(24) + (r.email || '')));
  }

  // one full preview so the copy is reviewed before anything is staged
  if (mail.length) {
    const s = mail[0];
    console.log('\n--- preview: step 1 to ' + s.full_name + ' ---');
    console.log('Subject: ' + subject(project));
    console.log(toText(render(1, project, s.block, s)));
    const g = guard(render(1, project, s.block, s), project);
    console.log(g.length ? '\nGUARD FAILED: ' + g.join('; ') : '\nguard: clean');
  }

  // ------------------------------------------------------------------- csv
  const dir = path.join(ROOT, 'market-outreach', project.slug);
  // Two batches for one project on one day is normal (different angles, or a
  // second list arriving later). Deriving the filename from the date alone made
  // the second run silently overwrite the first one's CSV.
  const nextCsvPath = () => {
    let p = path.join(dir, start + '-batch.csv');
    for (let n = 2; fs.existsSync(p); n++) p = path.join(dir, start + '-batch-' + n + '.csv');
    return p;
  };
  const csvPath = nextCsvPath();
  const header = 'Name,Title,Company,Angle,LinkedIn URL,Method of Contact,Previously Contacted';
  const body = rows.filter(r => !r.dup).map(r => [r.full_name, r.title, r.company_name, r.angle,
    r.linkedin_url, r.method === 'email' ? 'Email' : 'SalesNav', r.prior].map(csvCell).join(','));
  const csv = [header, ...body].join('\n') + '\n';

  if (!APPLY) {
    console.log('\nCSV would be written to market-outreach/' + project.slug + '/' + start + '-batch.csv');
    console.log('\n(report only - pass --apply to stage contacts and write the CSV)');
    await c.end();
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(csvPath, csv);

  // ----------------------------------------------------------------- stage
  let staged = 0, manual = 0;
  await c.query('begin');
  for (const r of rows) {
    if (r.dup || r.missingBlock) continue;
    const isMail = r.method === 'email';
    const ct = (await c.query(
      `insert into market.contact (project_id, full_name, first_name, title, company_name,
          company_domain, linkedin_url, angle, email, email_status, gate_reason, method, status, apollo_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [project.id, r.full_name, r.first_name, r.title, r.company_name, r.company_domain,
       r.linkedin_url, r.angle, r.email, r.email_status, r.gate_reason,
       r.method, isMail ? 'queued' : 'manual', r.apollo_id])).rows[0].id;

    if (!isMail) { manual++; continue; }

    for (let i = 0; i < 4; i++) {
      const n = i + 1;
      const html = render(n, project, r.block, r);
      // Step 4 has no body until the project insight is authored. Stage it as
      // planned with a null body; mo_send refuses to send an unrendered step.
      await c.query(
        `insert into market.step (contact_id, step_no, due_date, subject, body_html)
         values ($1,$2,$3,$4,$5)`,
        [ct, n, addDays(start, OFFSETS[i]), n === 1 ? subject(project) : 'Re: ' + subject(project), html]);
    }
    staged++;
  }
  await c.query('commit');

  console.log('\nstaged ' + staged + ' contacts with 4 steps each, ' + manual + ' routed to SalesNav');
  console.log('CSV: ' + path.relative(ROOT, csvPath).replace(/\\/g, '/'));
  console.log('Nothing has been sent. Run mo_send.js to send what is due.');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
