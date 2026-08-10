// Schedule Round 1 cadences for the work-queue companies.
// Writes to followups.json (what the 8:15am scheduler actually reads) AND to
// Supabase, so the two agree from the moment the cadence exists.
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const TODAY = '2026-08-10';

// Jul 31 / Aug 1 openers: Calvin asked to keep the cadence shape and re-anchor
// day 0 to today. Everyone else keeps their original anchor, with any date that
// has already passed pulled forward to today.
const REANCHOR = new Set(['Kaavio', 'TruTec', 'Varick Agents', 'Worktrace', 'Papermark', 'Ranger']);
const OFFSETS = { 2: 2, 3: 7, 4: 12 };

const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const firstName = f => String(f || '').trim().split(/\s+/)[0];
const P = a => a.map(p => '<div>' + p + '</div>').join('<div><br></div>');

const e2Body = f => P([`Hey ${firstName(f)} - wanted to follow up to see if you're free to connect in the next couple of weeks? Would love to see where Telescope can help out with what you're building.`]);

const e3Body = (f, co) => P([`Hey ${firstName(f)} - following up - how have you been thinking about your next raise? I really like what you're building at ${co} and would love to develop a relationship ahead of any future fundraise. We like getting to know founders and developing the relationship to make sure it's a good fit for both parties. However, LMK if I'm off the mark here - would love to get your thoughts regardless.`]);

const e4Body = (f, p2) => P([
  `Hey ${firstName(f)} - hope you've been well. Wanted to follow up again because I'm confident that we can be valuable in what you're building.`,
  p2,
  `This is a pattern we're really familiar with - helping software and AI companies accelerate GTM once they have a strong initial wedge, while using our operations team to expand the product into a broader platform. Telescope was built around Mickey's experience at Sequoia helping Seed and Series A companies scale beyond the early stage.`,
  `I'm not sure how you're thinking about fundraising, but I'd love to connect ahead of time and start building a relationship. We think about these partnerships over multiple years and really value working with high-quality folks. I'm happy to reach out later if it works better, but LMK your thoughts.`,
]);

function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

async function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, '_sched.json'), 'utf8'));
  const p2 = JSON.parse(fs.readFileSync(path.join(ROOT, '_p2b.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'followups.json'), 'utf8'));
  const c = await connect();

  const plan = [];
  for (const r of rows) {
    const insight = p2[r.company];
    if (!insight) { console.error('NO INSIGHT for ' + r.company + ' - skipped'); continue; }
    const opener = String(r.opener).slice(0, 10);
    const anchor = REANCHOR.has(r.company) ? TODAY : opener;
    const slug = slugify(r.company);
    const subject = 'Telescope <> ' + r.company + ' Intro';

    for (const n of [2, 3, 4]) {
      let due = addDays(anchor, OFFSETS[n]);
      if (due < TODAY) due = TODAY;          // never schedule into the past
      const body = n === 2 ? e2Body(r.founder)
                 : n === 3 ? e3Body(r.founder, r.company)
                 : e4Body(r.founder, insight);
      plan.push({ ...r, slug, subject, emailNumber: n, sendDate: due, body });
    }
  }

  // followups.json - the file the scheduler reads
  let added = 0;
  for (const p of plan) {
    if (cfg.pending.some(e => e.slug === p.slug && e.emailNumber === p.emailNumber)) continue;
    cfg.pending.push({
      slug: p.slug, company: p.company, founder: p.founder, email: p.email, domain: p.domain,
      threadId: p.thread_id, superhumanThreadId: p.thread_id, messageId: null,
      subject: p.subject, body: p.body, emailNumber: p.emailNumber,
      sendDate: p.sendDate, status: 'pending',
    });
    added++;
  }
  fs.writeFileSync(path.join(ROOT, 'followups.json'), JSON.stringify(cfg, null, 2));

  // Supabase - steps then flip the sequence live
  let steps = 0;
  const seqs = new Set();
  for (const p of plan) {
    await c.query(
      `insert into step (sequence_id, step_no, due_date, body_html, thread_id, status)
       values ($1,$2,$3,$4,$5,'planned')
       on conflict (sequence_id, step_no) do update set due_date = excluded.due_date,
                                                        body_html = excluded.body_html`,
      [p.seq_id, p.emailNumber, p.sendDate, p.body, p.thread_id]);
    steps++; seqs.add(p.seq_id);
  }
  for (const id of seqs) await c.query(`update sequence set status='active' where id=$1`, [id]);

  console.log(JSON.stringify({ companies: seqs.size, followups_entries_added: added, db_steps: steps }, null, 1));
  const chk = await c.query(`select co.name, min(s.due_date)::text next_send
     from sequence q join company co on co.id=q.company_id join step s on s.sequence_id=q.id
    where q.id = any($1::bigint[]) and s.status='planned' group by co.name order by 2,1`, [[...seqs]]);
  chk.rows.forEach(x => console.log('  ' + x.next_send + '  ' + x.name));
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
