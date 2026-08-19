// Rebuild missing followups.json mirror entries from Supabase.
//
//   node scripts/backfill_followups.js <company|domain> [more ...] [--apply]
//
// Supabase is the tracker; followups.json is the mirror the scheduled routine
// reads. A cadence opened without the mirror write goes missing here, and the
// scheduler never sees it. This reads the live sequence out of Supabase and
// writes the entries that are absent. It never edits an entry that already
// exists, and it never invents a body: a step with no body_html is skipped and
// reported, because the mirror is supposed to carry the copy that will go out.
//
// Entries are matched on slug + emailNumber + sendDate, the same key the
// collision guidance in CLAUDE.md uses for merging against origin/main.

const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const FILE = path.join(__dirname, '..', 'followups.json');
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const targets = args.filter(a => a !== '--apply');
  if (!targets.length) {
    console.error('usage: node scripts/backfill_followups.js <company|domain> [...] [--apply]');
    process.exit(1);
  }

  const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!Array.isArray(doc.pending)) throw new Error('followups.json has no pending array');
  const before = doc.pending.length;
  const key = e => [e.slug, e.emailNumber, e.sendDate].join('|');
  const seen = new Set(doc.pending.map(key));

  const c = await connect();
  const { rows } = await c.query(`
    select co.name company, ct.name founder, ct.email,
           -- company_domain has no ordering column, so pick the shortest
           -- domain, which is the canonical one when an alt_domain exists.
           (select cd.domain from company_domain cd
             where cd.company_id = co.id
             order by length(cd.domain), cd.domain limit 1) as domain,
           s.subject, s.status seq_status,
           st.step_no, to_char(st.due_date,'YYYY-MM-DD') send_date,
           st.status step_status, st.thread_id, st.body_html
      from sequence s
      join company co on co.id = s.company_id
      join contact ct on ct.id = s.contact_id
      join step st on st.sequence_id = s.id
     where s.status = 'active'
       and st.step_no > 1
       and (lower(co.name) = any($1) or exists (
             select 1 from company_domain d
              where d.company_id = co.id and lower(d.domain) = any($1)))
     order by co.name, st.step_no`, [targets.map(t => t.toLowerCase())]);

  if (!rows.length) {
    console.error('no active sequences matched: ' + targets.join(', '));
    await c.end();
    process.exit(1);
  }

  const added = [], skipped = [], present = [];
  for (const r of rows) {
    const slug = slugify(r.company);
    const k = [slug, r.step_no, r.send_date].join('|');
    if (seen.has(k)) { present.push(`${r.company} E${r.step_no}`); continue; }
    if (!r.body_html) { skipped.push(`${r.company} E${r.step_no} (no body_html)`); continue; }
    if (!r.thread_id) { skipped.push(`${r.company} E${r.step_no} (no thread_id)`); continue; }
    added.push({
      slug,
      company: r.company,
      founder: r.founder,
      email: r.email,
      domain: r.domain,
      threadId: r.thread_id,
      superhumanThreadId: r.thread_id,
      messageId: r.thread_id,
      subject: r.subject,
      body: r.body_html,
      emailNumber: r.step_no,
      sendDate: r.send_date,
      status: r.step_status === 'sent' ? 'completed' : 'pending',
    });
    seen.add(k);
  }

  for (const p of present) console.log('  already in mirror: ' + p);
  for (const s of skipped) console.log('  SKIPPED  ' + s);
  for (const a of added) console.log(`  + ${a.company} E${a.emailNumber} ${a.sendDate} ${a.status} <${a.email}>`);
  console.log(`\n${rows.length} live steps checked, ${present.length} already present, ` +
              `${skipped.length} skipped, ${added.length} to add`);

  if (apply && added.length) {
    doc.pending.push(...added);
    // Two-space indent and no trailing newline is the existing on-disk
    // convention; matching it keeps the diff to the added entries alone.
    fs.writeFileSync(FILE, JSON.stringify(doc, null, 2));
    console.log(`applied. followups.json pending: ${before} -> ${doc.pending.length}`);
    console.log('now commit and push followups.json.');
  } else {
    console.log(apply ? 'nothing to add.' : 'report only - re-run with --apply');
  }
  await c.end();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
