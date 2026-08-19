// Import a Google Calendar API events response into os_calendar_event.
//
//   node scripts/os_import_calendar.js <events.json> [--apply]
//
// A stopgap for the same job os_sync.js --calendar does directly. It exists
// because the Gmail OAuth token has no calendar scope yet, so events have to
// come in from a response captured elsewhere. Once
// `node scripts/reauth_google.js` has been run, use os_sync.js instead.
//
// Accepts either the full API response ({items:[...]} or {events:[...]}) or a
// bare array. status is never written, so checking a meeting off in the console
// survives a re-import.

const fs = require('fs');
const { connect } = require('./db');

/** Pacific calendar date of an instant. Events land on the day Calvin sees. */
const ptDay = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

(async () => {
  const file = process.argv.find(a => a.endsWith('.json'));
  const apply = process.argv.includes('--apply');
  if (!file) { console.error('usage: node scripts/os_import_calendar.js <events.json> [--apply]'); process.exit(1); }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = (Array.isArray(raw) ? raw : raw.items || raw.events || [])
    .filter(e => e.status !== 'cancelled');

  const c = await connect();
  let n = 0, skipped = 0;

  for (const e of items) {
    const allDay = !e.start?.dateTime;
    const startsAt = e.start?.dateTime || (e.start?.date ? e.start.date + 'T00:00:00-07:00' : null);
    if (!startsAt) { skipped++; continue; }

    const day = allDay ? e.start.date : ptDay(startsAt);
    const attendees = (e.attendees || [])
      .map(a => a.email)
      .filter(x => x && !/resource\.calendar\.google\.com$/.test(x));

    if (apply) {
      await c.query(`
        insert into os_calendar_event
          (external_id, summary, starts_at, ends_at, day, all_day, location, attendees, synced_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8, now())
        on conflict (external_id) do update set
          summary = excluded.summary, starts_at = excluded.starts_at,
          ends_at = excluded.ends_at, day = excluded.day, all_day = excluded.all_day,
          location = excluded.location, attendees = excluded.attendees, synced_at = now()`,
        [e.id, e.summary || '(no title)', startsAt,
         e.end?.dateTime || (e.end?.date ? e.end.date + 'T00:00:00-07:00' : null),
         day, allDay, e.location || null, attendees]);
    }
    console.log(`  ${day}  ${e.id}  ${(e.summary || '').slice(0, 62)}`);
    n++;
  }

  console.log(`\n${n} events${skipped ? `, ${skipped} skipped with no start` : ''}`);
  console.log(apply ? 'applied.' : 'report only. re-run with --apply');
  await c.end();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
