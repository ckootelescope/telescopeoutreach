#!/usr/bin/env node
/**
 * Store generated call briefs. See OS-ARCHITECTURE.md section 8.
 *
 *   node scripts/brief_write.js _briefs.json            report only
 *   node scripts/brief_write.js _briefs.json --apply
 *   node scripts/brief_write.js _briefs.json --apply --force   overwrite a human edit
 *
 * The Analyst does the research: Granola for what the last expert calls
 * established, the Gmail thread where Calvin, Chris and Mickey trade findings,
 * Affinity for history, Harmonic for what a company actually does. None of that
 * can happen in a cron, because those are MCP tools and MCP exists only inside a
 * Claude session. So the routine researches, writes a file, and calls this.
 *
 * This script does no research and no generation. It validates and stores. That
 * split keeps the expensive judgement in one place and makes the write path
 * boring, re-runnable and reviewable, like every other script here.
 *
 * Input: an array of
 * {
 *   "external_id": "<os_calendar_event.external_id>",
 *   "one_liner":   "what they do, plain language, no jargon",
 *   "questions":   ["...", "...", "..."],
 *   "sources":     ["granola:Expert Calls/pharmacy supply chain", "gmail:thread 19f2a"],
 *   "focus":       "optional one line on what to get out of it",
 *   "prep_note":   "optional anything else worth knowing walking in"
 * }
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const DASH = /--|—|–/;

function validate(b, known) {
  const e = [];
  if (!b.external_id) e.push('missing external_id');
  else if (!known.has(b.external_id)) e.push('no calendar event with external_id ' + b.external_id);

  if (!String(b.one_liner || '').trim()) e.push('missing one_liner');
  const qs = Array.isArray(b.questions) ? b.questions.filter(q => String(q || '').trim()) : [];
  // Three is the contract, not a suggestion. A list of ten is a document nobody
  // reads on the way into a call.
  if (qs.length < 3) e.push('needs 3 questions, got ' + qs.length);
  if (qs.length > 3) e.push('more than 3 questions (' + qs.length + '); pick the three that matter');

  // Same rule the outreach copy lives under. These get read on a phone screen
  // thirty seconds before a call and should look like Calvin wrote them.
  const text = [b.one_liner, b.focus, b.prep_note, ...qs].filter(Boolean).join(' ');
  if (DASH.test(text)) e.push('contains an em dash or --');

  // A brief with no provenance does not get trusted, and an untrusted brief
  // gets ignored, which makes the whole exercise worthless.
  if (!Array.isArray(b.sources) || !b.sources.length) e.push('missing sources');
  return e;
}

async function main() {
  const src = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!src) { console.error('usage: brief_write.js <briefs.json> [--apply] [--force]'); process.exit(1); }
  const briefs = JSON.parse(fs.readFileSync(path.isAbsolute(src) ? src : path.join(ROOT, src), 'utf8'));
  if (!Array.isArray(briefs)) { console.error('expected an array'); process.exit(1); }

  const c = await connect();
  const known = new Set((await c.query(`select external_id from os_calendar_event`)).rows.map(r => r.external_id));

  // A brief Calvin edited himself outranks anything generated. Silently
  // replacing his wording on the next nightly run would teach him not to edit.
  const humanEdited = new Set((await c.query(
    `select external_id from os_meeting_brief where generated_by = 'calvin'`)).rows.map(r => r.external_id));

  const ok = [], bad = [], skipped = [];
  for (const b of briefs) {
    const errs = validate(b, known);
    if (errs.length) { bad.push({ b, errs }); continue; }
    if (humanEdited.has(b.external_id) && !FORCE) { skipped.push(b); continue; }
    ok.push(b);
  }

  const label = id => {
    const r = briefs.find(x => x.external_id === id);
    return (r && r.one_liner ? r.one_liner.slice(0, 44) : id);
  };

  console.log('briefs in file: ' + briefs.length);
  console.log('\nWILL WRITE (' + ok.length + ')');
  for (const b of ok) {
    const ev = (await c.query(`select summary, starts_at from os_calendar_event where external_id=$1`,
      [b.external_id])).rows[0];
    console.log('  ' + String(ev ? ev.summary : b.external_id).slice(0, 44).padEnd(46) +
      (b.questions || []).length + 'q  ' + (b.sources || []).length + ' sources');
  }
  if (skipped.length) {
    console.log('\nSKIPPED, edited by hand (' + skipped.length + ') - pass --force to overwrite');
    skipped.forEach(b => console.log('  ' + label(b.external_id)));
  }
  if (bad.length) {
    console.log('\nREJECTED (' + bad.length + ')');
    bad.forEach(x => console.log('  ' + String(x.b.external_id || '(no id)').slice(0, 40) + ': ' + x.errs.join('; ')));
  }

  if (ok.length) {
    const s = ok[0];
    console.log('\n--- preview ---');
    console.log(s.one_liner);
    (s.questions || []).forEach((q, i) => console.log('  ' + (i + 1) + '. ' + q));
    console.log('  sources: ' + (s.sources || []).join(', '));
  }

  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  let n = 0;
  await c.query('begin');
  for (const b of ok) {
    await c.query(
      `insert into os_meeting_brief (external_id, one_liner, questions, sources, focus, prep_note,
          generated_at, generated_by)
       values ($1,$2,$3,$4,$5,$6, now(), 'analyst')
       on conflict (external_id) do update set
          one_liner = excluded.one_liner,
          questions = excluded.questions,
          sources   = excluded.sources,
          focus     = coalesce(excluded.focus, os_meeting_brief.focus),
          prep_note = excluded.prep_note,
          generated_at = now(),
          generated_by = 'analyst'`,
      [b.external_id, b.one_liner, JSON.stringify(b.questions),
       JSON.stringify(b.sources), b.focus || null, b.prep_note || null]);
    n++;
  }
  await c.query('commit');

  const left = (await c.query(`select count(*)::int n from v_brief_queue`)).rows[0].n;
  console.log('\nwrote ' + n + ' brief(s). Still unbriefed in the next 48h: ' + left);
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
