// Open a Round 1 cadence for a company whose opener has already gone out.
// Creates company + contact + sequence, records step 1 as sent against the real
// Gmail thread, and schedules steps 2/3/4 on the Day 0/+2/+7/+12 cadence in both
// Supabase and followups.json.
//
//   node scripts/new_cadence.js _new.json            report only
//   node scripts/new_cadence.js _new.json --apply
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const SRC = process.argv[2];
const OFFSETS = { 2: 2, 3: 7, 4: 12 };

const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const firstName = f => String(f || '').trim().split(/\s+/)[0];
const P = a => a.map(p => '<div>' + p + '</div>').join('<div><br></div>');
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const e2Body = f => P([`Hey ${firstName(f)} - wanted to follow up to see if you're free to connect in the next couple of weeks? Would love to see where Telescope can help out with what you're building.`]);

const e3Body = (f, co) => P([`Hey ${firstName(f)} - following up - how have you been thinking about your next raise? I really like what you're building at ${co} and would love to develop a relationship ahead of any future fundraise. We like getting to know founders and developing the relationship to make sure it's a good fit for both parties. However, LMK if I'm off the mark here - would love to get your thoughts regardless.`]);

const e4Body = (f, p2) => P([
  `Hey ${firstName(f)} - hope you've been well. Wanted to follow up again because I'm confident that we can be valuable in what you're building.`,
  p2,
  `This is a pattern we're really familiar with - helping software and AI companies accelerate GTM once they have a strong initial wedge, while using our operations team to expand the product into a broader platform. Telescope was built around Mickey's experience at Sequoia helping Seed and Series A companies scale beyond the early stage.`,
  `I'm not sure how you're thinking about fundraising, but I'd love to connect ahead of time and start building a relationship. We think about these partnerships over multiple years and really value working with high-quality folks. I'm happy to reach out later if it works better, but LMK your thoughts.`,
]);

async function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, SRC), 'utf8'));
  const c = await connect();

  const plan = [];
  for (const r of rows) {
    const dup = await c.query(
      `select co.name from company co
        left join company_domain d on d.company_id = co.id
        where co.primary_domain = $1 or d.domain = $1`, [r.domain]);
    if (dup.rows.length) { console.error('ALREADY EXISTS ' + r.domain + ' -> ' + dup.rows[0].name + ' - skipped'); continue; }
    plan.push({ ...r, slug: slugify(r.company),
      subject: r.subject_override || 'Telescope <> ' + r.company + ' Intro' });
  }

  console.log('opening ' + plan.length + ' cadences from day 0');
  plan.forEach(p => console.log('  ' + p.company.padEnd(14) + ' ' + p.sent_on +
    '  E2 ' + addDays(p.sent_on, 2) + '  E3 ' + addDays(p.sent_on, 7) + '  E4 ' + addDays(p.sent_on, 12)));
  if (!APPLY) { console.log('\n(report only - pass --apply to write)'); await c.end(); return; }

  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'followups.json'), 'utf8'));
  let added = 0;

  for (const p of plan) {
    await c.query('begin');
    const co = await c.query(
      `insert into company (name, primary_domain, status) values ($1,$2,'active') returning id`,
      [p.company, p.domain]);
    const companyId = co.rows[0].id;
    await c.query(`insert into company_domain (domain, company_id) values ($1,$2)
                   on conflict (domain) do nothing`, [p.domain, companyId]);
    if (p.alt_domain) await c.query(`insert into company_domain (domain, company_id) values ($1,$2)
                   on conflict (domain) do nothing`, [p.alt_domain, companyId]);

    const ct = await c.query(
      `insert into contact (company_id, name, email, linkedin) values ($1,$2,$3,$4)
       on conflict (email) do update set company_id=excluded.company_id returning id`,
      [companyId, p.founder, p.email, p.linkedin || null]);
    const contactId = ct.rows[0].id;

    await c.query(
      `insert into prior_check (company_id, source, verdict, detail)
       values ($1,'affinity','clear',$2)`,
      [companyId, p.prior_check || 'no prior Telescope interaction on record']);

    const sq = await c.query(
      `insert into sequence (company_id, contact_id, round, kind, subject, status, started_on)
       values ($1,$2,1,'first',$3,'needs_scheduling',$4) returning id`,
      [companyId, contactId, p.subject, p.sent_on]);
    const seqId = sq.rows[0].id;

    // step 1 is the opener that already went out
    await c.query(
      `insert into step (sequence_id, step_no, due_date, body_html, thread_id, sent_at, status)
       values ($1,1,$2,$3,$4,$5,'sent')`,
      [seqId, p.sent_on, p.opener_html || null, p.thread_id, p.sent_at]);

    for (const n of [2, 3, 4]) {
      const body = n === 2 ? e2Body(p.founder) : n === 3 ? e3Body(p.founder, p.company) : e4Body(p.founder, p.p2);
      await c.query(
        `insert into step (sequence_id, step_no, due_date, body_html, thread_id, status)
         values ($1,$2,$3,$4,$5,'planned')`,
        [seqId, n, addDays(p.sent_on, OFFSETS[n]), body, p.thread_id]);
      if (!cfg.pending.some(e => e.slug === p.slug && e.emailNumber === n)) {
        cfg.pending.push({
          slug: p.slug, company: p.company, founder: p.founder, email: p.email, domain: p.domain,
          threadId: p.thread_id, superhumanThreadId: p.thread_id, messageId: p.message_id || null,
          subject: p.subject, body, emailNumber: n,
          sendDate: addDays(p.sent_on, OFFSETS[n]), status: 'pending',
        });
        added++;
      }
    }

    await c.query(`update sequence set status='active' where id=$1`, [seqId]);
    await c.query(
      `insert into email_event (contact_id, company_id, direction, sender_email, peer_email,
                                thread_id, message_id, subject, sent_at, source)
       values ($1,$2,'out','calvin@telescopepartners.com',$3,$4,$5,$6,$7,'gmail')
       on conflict (message_id) do nothing`,
      [contactId, companyId, p.email, p.thread_id, p.message_id, p.subject, p.sent_at]);
    await c.query('commit');
    console.log('  opened ' + p.company);
  }

  fs.writeFileSync(path.join(ROOT, 'followups.json'), JSON.stringify(cfg, null, 2));
  console.log(JSON.stringify({ cadences_opened: plan.length, followups_entries_added: added }, null, 1));
  await c.end();
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
