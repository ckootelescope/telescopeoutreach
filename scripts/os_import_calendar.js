// Import a Google Calendar API events response into os_calendar_event.
//
//   node scripts/os_import_calendar.js <events.json> [--apply] [--prune]
//
// A stopgap for the same job os_sync.js --calendar does directly. It exists
// because the Gmail OAuth token has no calendar scope yet, so events have to
// come in from a response captured elsewhere. Once
// `node scripts/reauth_google.js` has been run, use os_sync.js instead.
//
// Accepts either the full API response ({items:[...]} or {events:[...]}) or a
// bare array. status is never written, so checking a meeting off in the console
// survives a re-import.
//
// --prune deletes rows inside the imported date range that the feed did not
// carry. Without it an upsert-only import can never forget: a meeting Calvin
// cancelled keeps its row and keeps showing on the dashboard, which is how a
// cancelled call ends up counted as booked. The range is taken from the feed
// itself, so nothing outside the window Google was asked about is at risk.
// A brief is deleted with its event, so prune only against a complete feed.
//
// Only today forward is pruned. A past meeting missing from the feed is not
// evidence it never happened: calendars get tidied, and a call Calvin took in
// August should not vanish from the record because the invite was deleted in
// September. Ahead of today the calendar IS the plan, so anything the feed has
// dropped is genuinely off.

const fs = require('fs');
const { connect } = require('./db');

/** Pacific calendar date of an instant. Events land on the day Calvin sees. */
const ptDay = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

(async () => {
  const file = process.argv.find(a => a.endsWith('.json'));
  const apply = process.argv.includes('--apply');
  const prune = process.argv.includes('--prune');
  if (!file) { console.error('usage: node scripts/os_import_calendar.js <events.json> [--apply] [--prune]'); process.exit(1); }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const feed = (Array.isArray(raw) ? raw : raw.items || raw.events || [])
    .filter(e => e.status !== 'cancelled');

  // The outreach cadence drops a "LinkedIn Connect: <founder> - <company>"
  // reminder on the calendar for every opener it sends (Step 5 of the outreach
  // flow). They are reminders, not meetings: a dozen of them land on one
  // morning, none of them will ever have a brief, so on the dashboard they read
  // as a wall of meetings that need prep. Keep them on the calendar where the
  // reminder is useful, out of the OS where it is not.
  const items = feed.filter(e => !/^\s*LinkedIn Connect:/i.test(String(e.summary || '')));
  const reminders = feed.length - items.length;

  const c = await connect();
  let n = 0, skipped = 0;
  const ids = [];      // every id the feed carried, for --prune
  const days = [];     // and every day it touched, to bound the prune window

  for (const e of items) {
    const allDay = !e.start?.dateTime;
    const startsAt = e.start?.dateTime || (e.start?.date ? e.start.date + 'T00:00:00-07:00' : null);
    if (!startsAt) { skipped++; continue; }

    const day = allDay ? e.start.date : ptDay(startsAt);
    ids.push(e.id);
    days.push(day);
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

  console.log(`\n${n} events${skipped ? `, ${skipped} skipped with no start` : ''}` +
              `${reminders ? `, ${reminders} LinkedIn Connect reminder(s) ignored` : ''}`);

  if (prune && days.length) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const feedFrom = days.reduce((a, b) => (a < b ? a : b));
    const from = feedFrom > today ? feedFrom : today;
    const to = days.reduce((a, b) => (a > b ? a : b));
    const gone = await c.query(
      `select external_id, day, summary from os_calendar_event
        where day between $1 and $2 and not (external_id = any($3))
        order by day`, [from, to, ids]);

    console.log(`\nin ${from}..${to} but no longer on the calendar: ${gone.rows.length}`);
    for (const r of gone.rows) {
      console.log(`  ${r.day.toISOString().slice(0, 10)}  ${String(r.summary).slice(0, 58)}`);
    }
    if (apply && gone.rows.length) {
      const del = await c.query(
        `delete from os_calendar_event
          where day between $1 and $2 and not (external_id = any($3))`, [from, to, ids]);
      console.log(`  deleted ${del.rowCount} (briefs cascade)`);
    }
  }

  console.log(apply ? 'applied.' : 'report only. re-run with --apply');
  await c.end();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
