#!/usr/bin/env node
/**
 * Send market-outreach steps that are due, throttled and spaced.
 * See market-outreach/SPEC.md
 *
 *   node scripts/mo_send.js                   report only - what would go out
 *   node scripts/mo_send.js --apply           send it
 *   node scripts/mo_send.js --apply --cap=10  smaller batch
 *   node scripts/mo_send.js --project=pathwork
 *
 * Sends through the Gmail API rather than Superhuman because the daily job runs
 * unattended and cannot call an MCP tool. That has one consequence worth
 * knowing: Superhuman injects Calvin's signature on send, and the API does not,
 * so the signature is appended here instead. It is the same markup Superhuman
 * produces, lifted from a real sent message.
 *
 * Because this script performs the send itself, send and record cannot diverge.
 * There is deliberately no equivalent of the company engine's mark_sent.js.
 */
const crypto = require('crypto');
const { connect } = require('./db');
const { req, token } = require('./gmail_req');
const { guard, toText } = require('./mo_render');
const lock = require('./mo_lock');

const APPLY = process.argv.includes('--apply');
const capArg = process.argv.find(a => a.startsWith('--cap='));
const projArg = process.argv.find(a => a.startsWith('--project='));
const CAP = capArg ? Number(capArg.slice(6)) : 60;      // global sends per day
// Normally later steps go first: someone already in a thread is mid-conversation
// and their cadence is the thing with a clock on it. A conference inverts that,
// because a first touch is worthless the day after the event while a follow-up
// can slip a day at no cost. Off by default; the daily runner passes it.
const FIRST_FIRST = process.argv.includes('--first-first');
const FORCE = process.argv.includes('--force');
const ME = 'calvin@telescopepartners.com';
const ME_NAME = 'Calvin Koo';
const MIN_GAP_MS = 4 * 60e3, MAX_GAP_MS = 7 * 60e3;
// Pacific, inclusive start / exclusive end. The point is to stop a batch going
// out at 2am, not to enforce an opinion about the best hour to send. The first
// version used 8 to 16 and blocked a perfectly ordinary 4:50pm send.
const WINDOW_START = 7, WINDOW_END = 19;

/** Current hour in Pacific. Node may be running on a UTC box, so do not use getHours(). */
const ptHour = () => Number(new Intl.DateTimeFormat('en-US',
  { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }).format(new Date()));

const SIGNATURE =
  '<div class="gmail_signature"><div dir="ltr">Best,<div>Calvin</div><div><br></div><div>' +
  '<table cellpadding="0" cellspacing="0" border="0" style="font-size:medium;color:rgb(26,26,26);line-height:1.5"><tbody>' +
  '<tr><td style="padding-bottom:4px;line-height:0"><img src="https://cdn.brandfolder.io/G5P1QT08/as/q9zh9l-ghl0q0-f1td7h/telescope-email-sig.png" alt="Telescope Partners" width="96" height="24"></td></tr>' +
  '<tr><td style="font-size:12px;font-weight:bold;letter-spacing:0.5px">Calvin Koo | Investor<br></td></tr>' +
  '<tr><td style="font-size:12px"><b style="color:rgb(0,0,238)">' +
  '<a href="https://calendly.com/calvin-telescopepartners/30min" rel="noopener noreferrer" target="_blank">Availability</a></b>' +
  ' | <a href="mailto:calvin@telescopepartners.com" target="_blank">calvin@telescopepartners.com</a>' +
  ' | <a href="tel:+12135039944" target="_blank">(213) 503-9944</a></td></tr>' +
  '</tbody></table></div></div></div>';

const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = () => MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));

/** RFC 2047 for non-ASCII subjects, plain otherwise. */
const encHeader = s =>
  /^[\x20-\x7E]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';

function mime({ to, toName, subject, html, rfcId, inReplyTo, references }) {
  const h = [
    'From: ' + ME_NAME + ' <' + ME + '>',
    'To: ' + (toName ? '"' + toName.replace(/"/g, '') + '" <' + to + '>' : to),
    'Subject: ' + encHeader(subject),
    'Message-ID: ' + rfcId,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  if (inReplyTo) { h.push('In-Reply-To: ' + inReplyTo); h.push('References: ' + (references || inReplyTo)); }
  const body = Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return h.join('\r\n') + '\r\n\r\n' + body;
}

async function gmailSend(t, raw, threadId) {
  const payload = JSON.stringify(threadId ? { raw: b64url(raw), threadId } : { raw: b64url(raw) });
  const r = await req({
    hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/messages/send', method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json',
               'Content-Length': Buffer.byteLength(payload) },
  }, payload);
  if (r.s !== 200) throw new Error('gmail send ' + r.s + ': ' + r.b.slice(0, 200));
  return JSON.parse(r.b);
}

/** The LinkedIn nudge: a draft to Calvin whose subject is the profile URL. */
async function gmailDraft(t, { subject, html }) {
  const raw = mime({ to: ME, toName: ME_NAME, subject, html, rfcId: '<' + crypto.randomUUID() + '@telescopepartners.com>' });
  const payload = JSON.stringify({ message: { raw: b64url(raw) } });
  const r = await req({
    hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/drafts', method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json',
               'Content-Length': Buffer.byteLength(payload) },
  }, payload);
  if (r.s !== 200) throw new Error('gmail draft ' + r.s + ': ' + r.b.slice(0, 200));
  return JSON.parse(r.b);
}

async function main() {
  const c = await connect();

  const params = [];
  let where = '';
  if (projArg) { params.push(projArg.slice(10)); where = ' and d.project_slug = $1'; }
  const due = await c.query(
    `select d.*, p.anchor_company, p.industry, p.industry_label, p.fu3_insight_html,
            s.body_html, s.subject, s.status step_status
       from market.v_due d
       join market.step s on s.id = d.step_id
       join market.project p on p.id = d.project_id
      where true${where}
      order by ${FIRST_FIRST ? '(d.step_no = 1) desc, ' : ''}d.step_no desc, d.due_date, d.contact_id`, params);

  // A row left in 'sending' means a process died between claiming it and
  // recording the result, so nobody knows whether the mail actually went out.
  // Never auto-retry that: re-sending is how people get the same note twice.
  // Surface it and let a human check the mailbox.
  const stuck = await c.query(
    `select ct.full_name, s.step_no, s.id from market.step s
       join market.contact ct on ct.id = s.contact_id
      where s.status = 'sending'`);
  if (stuck.rows.length) {
    console.log('WARNING: ' + stuck.rows.length + ' step(s) stuck mid-send. Check the mailbox before deciding:');
    stuck.rows.forEach(x => console.log('  step ' + x.id + '  E' + x.step_no + '  ' + x.full_name));
    console.log('  sent already -> mark it sent; never went out -> set it back to planned.\n');
  }

  if (!due.rows.length) { console.log('nothing due'); await c.end(); return; }

  // Already sent today, so a re-run inside one day cannot blow past the cap.
  const sentToday = Number((await c.query(
    `select count(*)::int n from market.step where status='sent' and sent_at::date = pt_today()`)).rows[0].n);
  const room = Math.max(0, CAP - sentToday);

  const ready = [], blocked = [];
  for (const r of due.rows) {
    if (!r.body_html) {
      blocked.push({ r, why: r.step_no === 4 ? 'step 4 has no body: project insight not authored' : 'no body' });
      continue;
    }
    const g = guard(r.body_html, { anchor_company: r.anchor_company });
    if (g.length) { blocked.push({ r, why: g.join('; ') }); continue; }
    ready.push(r);
  }

  const toSend = ready.slice(0, room);
  const held = ready.slice(room);

  console.log('due: ' + due.rows.length + '   sent today: ' + sentToday + '/' + CAP +
              '   will send: ' + toSend.length + (held.length ? '   deferred to tomorrow: ' + held.length : ''));
  console.log('spacing: ' + (MIN_GAP_MS / 60e3) + '-' + (MAX_GAP_MS / 60e3) + ' min between sends\n');
  for (const r of toSend) {
    console.log('  E' + r.step_no + '  ' + String(r.full_name).padEnd(22) + String(r.email).padEnd(32) +
                r.project_slug + '  due ' + String(r.due_date).slice(0, 10));
  }
  if (blocked.length) {
    console.log('\nBLOCKED (' + blocked.length + ')');
    blocked.forEach(b => console.log('  E' + b.r.step_no + '  ' + String(b.r.full_name).padEnd(22) + b.why));
  }

  if (!APPLY) {
    if (toSend.length) {
      const s = toSend[0];
      console.log('\n--- preview: E' + s.step_no + ' to ' + s.full_name + ' ---');
      console.log('Subject: ' + s.subject);
      console.log(toText(s.body_html));
    }
    console.log('\n(report only - pass --apply to send)');
    await c.end();
    return;
  }

  // Cold outreach that lands at 10pm reads as a blast. The daily job runs in the
  // morning so this never fires for it, but a manual --apply easily can.
  const hr = ptHour();
  if ((hr < WINDOW_START || hr >= WINDOW_END) && !FORCE) {
    console.log('\nREFUSING: it is ' + hr + ':00 Pacific, outside the ' +
      WINDOW_START + ':00-' + WINDOW_END + ':00 send window.');
    console.log('Nothing sent. Re-run in the morning, or pass --force if you mean it.');
    await c.end();
    return;
  }

  const lockedBy = lock.acquire('mo_send');
  if (lockedBy) {
    console.log('\nREFUSING: another market-outreach Gmail job holds the lock: ' + lockedBy);
    console.log('Running two at once trips the per-user rate limit and real sends come back 429.');
    await c.end();
    return;
  }

  // A Google access token lives about an hour. This batch is deliberately slow
  // (60 sends at 4 to 7 minutes is roughly five hours), so fetching one token up
  // front guarantees every send after the first hour dies with a 401. Three real
  // sends were lost to exactly that. Refresh on age instead.
  let t = await token();
  let tokenAt = Date.now();
  const TOKEN_TTL_MS = 40 * 60e3;
  const freshToken = async () => {
    if (Date.now() - tokenAt > TOKEN_TTL_MS) { t = await token(); tokenAt = Date.now(); }
    return t;
  };
  let ok = 0, fail = 0, nudges = 0;

  for (let i = 0; i < toSend.length; i++) {
    const r = toSend[i];
    // The window was checked before the first send, but a full batch runs for
    // hours and would otherwise walk straight out the far side of it. Stop at
    // the edge and leave the remainder for tomorrow.
    if (!FORCE && ptHour() >= WINDOW_END) {
      console.log('\nreached ' + WINDOW_END + ':00 Pacific, stopping. ' +
        (toSend.length - i) + ' still queued, they go tomorrow.');
      break;
    }
    try {
      // Claim the row BEFORE touching Gmail. Reading a step as 'planned' and
      // only marking it sent afterwards leaves a window in which a second
      // process reads the same row and sends the same mail: Anna Patrick and
      // Jake Christensen each got the identical follow-up twice, eight minutes
      // apart, from concurrent senders. This UPDATE is atomic, so exactly one
      // process can win the row and the loser skips it.
      const claim = await c.query(
        `update market.step set status='sending'
          where id = $1 and status = 'planned' returning id`, [r.step_id]);
      if (!claim.rowCount) {
        console.log('  skip  E' + r.step_no + '  ' + r.full_name + ' (claimed by another run)');
        continue;
      }

      // Follow-ups reply on step 1's thread.
      let threadId = null, inReplyTo = null, references = null;
      if (r.step_no > 1) {
        const first = (await c.query(
          `select thread_id, rfc_message_id from market.step
            where contact_id = $1 and step_no = 1 and status = 'sent'`, [r.contact_id])).rows[0];
        if (!first || !first.thread_id) throw new Error('step 1 not sent, cannot thread follow-up');
        threadId = first.thread_id;
        inReplyTo = first.rfc_message_id;
        references = first.rfc_message_id;
      }

      const rfcId = '<' + crypto.randomUUID() + '@telescopepartners.com>';
      const html = r.body_html + '<div><br></div>' + SIGNATURE;
      const raw = mime({ to: r.email, toName: r.full_name, subject: r.subject, html,
                         rfcId, inReplyTo, references });
      const res = await gmailSend(await freshToken(), raw, threadId);

      await c.query('begin');
      await c.query(
        `update market.step set status='sent', sent_at=now(), thread_id=$2, message_id=$3,
            rfc_message_id=$4, fail_reason=null where id=$1`,
        [r.step_id, res.threadId, res.id, rfcId]);
      await c.query(
        `update market.contact set status='active' where id=$1 and status='queued'`, [r.contact_id]);
      await c.query(
        `insert into market.event (contact_id, project_id, direction, kind, sender_email, peer_email,
            thread_id, message_id, subject, sent_at)
         values ($1,$2,'out','outbound',$3,$4,$5,$6,$7,now())
         on conflict (message_id) do nothing`,
        [r.contact_id, r.project_id, ME, r.email, res.threadId, res.id, r.subject]);
      await c.query('commit');
      ok++;
      console.log('  sent  E' + r.step_no + '  ' + r.full_name + '  <' + r.email + '>');

      // Step 1 only: queue the LinkedIn nudge to Calvin.
      if (r.step_no === 1) {
        try {
          const d = await gmailDraft(await freshToken(), {
            subject: r.linkedin_url || ('LinkedIn: ' + r.full_name),
            html: '<div><b>' + r.subject + '</b></div><div><br></div>' + r.body_html,
          });
          await c.query(
            `insert into market.nudge (contact_id, draft_id, status) values ($1,$2,'queued')
             on conflict (contact_id) do update set draft_id = excluded.draft_id`,
            [r.contact_id, d.id]);
          nudges++;
        } catch (e) {
          console.log('    nudge draft failed: ' + e.message);
        }
      }
    } catch (e) {
      fail++;
      await c.query(`update market.step set status='failed', fail_reason=$2 where id=$1`,
        [r.step_id, String(e.message).slice(0, 300)]).catch(() => {});
      console.log('  FAIL  E' + r.step_no + '  ' + r.full_name + ': ' + e.message);
    }

    if (i < toSend.length - 1) {
      const gap = jitter();
      console.log('    ... waiting ' + Math.round(gap / 60e3) + ' min');
      await sleep(gap);
    }
  }

  console.log('\nsent ' + ok + ', failed ' + fail + ', nudge drafts ' + nudges);
  if (held.length) console.log(held.length + ' held by the daily cap, will go tomorrow');
  await c.end();
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
