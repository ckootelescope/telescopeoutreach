// Load the Affinity Hard to Crack saved view into os_hard_to_crack.
//
//   node scripts/os_htc_sync.js <affinity-page.json> [more.json ...] [--apply]
//
// Affinity list 333624, saved view 2354626. Accepts one or more captured API
// responses because the view pages at 30-40 entries. Membership and status come
// from Affinity; one_liner, next_step and note are written here and are NOT
// overwritten by a re-sync, so anything Calvin adds survives.

const fs = require('fs');
const { connect } = require('./db');

const fieldVal = (fields, name) => {
  const f = (fields || []).find(x => x.name === name);
  const v = f && f.value && f.value.data;
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(x => x.text || x.name).filter(Boolean).join(', ') || null;
  if (typeof v === 'object') return v.text ?? null;
  return v;
};

(async () => {
  const files = process.argv.slice(2).filter(a => a.endsWith('.json'));
  const apply = process.argv.includes('--apply');
  if (!files.length) { console.error('usage: node scripts/os_htc_sync.js <page.json> [...] [--apply]'); process.exit(1); }

  const rows = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const e of (j.data || [])) {
      const ent = e.entity || {};
      const fl = ent.fields || [];
      const lastEmail = (fl.find(x => x.name === 'Last Email') || {}).value;
      const d = lastEmail && lastEmail.data;
      rows.push({
        company: ent.name,
        domain: ent.domain || (ent.domains || [])[0] || null,
        tp_status: fieldVal(fl, 'TPStatus'),
        list_status: fieldVal(fl, 'Status'),
        tp_owner: fieldVal(fl, 'TPOwner'),
        score: fieldVal(fl, 'Score'),
        last_email_at: d && d.sentAt ? d.sentAt.slice(0, 10) : null,
        last_email_subject: d ? d.subject || null : null,
        last_email_to: d && d.to && d.to[0] ? d.to[0].emailAddress : null,
      });
    }
  }

  const c = await connect();
  for (const r of rows) {
    if (!r.company) continue;
    if (apply) {
      await c.query(`
        insert into os_hard_to_crack
          (company, domain, tp_status, list_status, tp_owner, score,
           last_email_at, last_email_subject, last_email_to, synced_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
        on conflict (company) do update set
          domain = coalesce(excluded.domain, os_hard_to_crack.domain),
          tp_status = excluded.tp_status, list_status = excluded.list_status,
          tp_owner = excluded.tp_owner, score = excluded.score,
          last_email_at = excluded.last_email_at,
          last_email_subject = excluded.last_email_subject,
          last_email_to = excluded.last_email_to,
          active = true, synced_at = now()`,
        [r.company, r.domain, r.tp_status, r.list_status, r.tp_owner, r.score,
         r.last_email_at, r.last_email_subject, r.last_email_to]);
    }
  }

  const owned = rows.filter(r => (r.tp_owner || '').includes('Calvin')).length;
  const stale = rows.filter(r => !r.last_email_at).length;
  console.log(`${rows.length} companies, ${owned} owned by Calvin, ${stale} with no email on record`);
  console.log(apply ? 'applied.' : 'report only. re-run with --apply');
  await c.end();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
