const https = require('https');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'followups.json');

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_SENDER_EMAIL = process.env.GMAIL_SENDER_EMAIL;
const SHEET_ID = '1Sk9HndYNzXj_tHg8-T4EGqSqkPk1QKXH2UOQt23s7CA';
const SHEET_TAB = 'Activity Log';

const EMAIL_SIGNATURE = '<br><div><div dir="ltr">Best,<div>Calvin</div><div><br></div><div><table cellpadding="0" cellspacing="0" border="0" style="font-size:medium;color:rgb(26,26,26);line-height:1.5"><tbody><tr><td style="padding-bottom:4px;line-height:0"><img src="https://cdn.brandfolder.io/G5P1QT08/as/q9zh9l-ghl0q0-f1td7h/telescope-email-sig.png" alt="Telescope Partners" width="96" height="24"></td></tr><tr><td style="font-size:12px;font-weight:bold;letter-spacing:0.5px">CALVIN KOO | INVESTOR</td></tr><tr><td style="font-size:12px"><a href="mailto:calvin@telescopepartners.com">calvin@telescopepartners.com</a> | <a href="tel:213-503-9944">(213) 503-9944</a></td></tr></tbody></table></div></div></div>';

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken() {
  const tokenBody = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    refresh_token: GMAIL_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  }).toString();
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, tokenBody);
  if (res.statusCode !== 200) throw new Error('Token refresh failed: ' + res.body);
  return JSON.parse(res.body).access_token;
}

async function checkForBounces(accessToken, senderEmail, founderEmail) {
  const query = encodeURIComponent('from:(mailer-daemon OR postmaster) to:' + senderEmail + ' subject:(delivery OR failure OR undeliverable) newer_than:14d');
  const res = await httpsRequest({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/messages?q=' + query + '&maxResults=5',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  if (res.statusCode !== 200) return false;
  const data = JSON.parse(res.body);
  if (!data.messages) return false;
  for (const msg of data.messages) {
    const msgRes = await httpsRequest({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/' + msg.id + '?format=full',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    if (msgRes.statusCode !== 200) continue;
    const snippet = JSON.parse(msgRes.body).snippet || '';
    if (snippet.toLowerCase().includes(founderEmail.toLowerCase())) return true;
  }
  return false;
}

async function checkForReplies(accessToken, senderEmail, domain, subject, threadId) {
  const query = encodeURIComponent('to:' + senderEmail + ' from:' + domain + ' in:anywhere');
  const res = await httpsRequest({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/messages?q=' + query + '&maxResults=10',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  if (res.statusCode !== 200) return { hasReply: false, isBounce: false };
  const data = JSON.parse(res.body);
  if (!data.messages || data.messages.length === 0) return { hasReply: false, isBounce: false };

  for (const msg of data.messages) {
    const msgRes = await httpsRequest({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/' + msg.id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=Auto-Submitted&metadataHeaders=X-Autoreply&metadataHeaders=From',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    if (msgRes.statusCode !== 200) continue;
    const msgData = JSON.parse(msgRes.body);
    const headers = msgData.payload.headers;
    const getHeader = (name) => { const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase()); return h ? h.value : null; };

    const autoSubmitted = getHeader('Auto-Submitted');
    const xAutoreply = getHeader('X-Autoreply');
    const subj = getHeader('Subject') || '';
    const from = getHeader('From') || '';

    if (from.includes('mailer-daemon') || from.includes('postmaster') || subj.toLowerCase().includes('undeliverable'))
      return { hasReply: false, isBounce: true };
    if (autoSubmitted && autoSubmitted !== 'no') continue;
    if (xAutoreply === 'yes') continue;
    if (subj.toLowerCase().includes('out of office') || subj.toLowerCase().includes('automatic reply')) continue;

    if (subj.includes(subject.replace('Re: ', '')) || (threadId && msgData.threadId === threadId))
      return { hasReply: true, isBounce: false };
  }
  return { hasReply: false, isBounce: false };
}

async function createDraft(accessToken, senderEmail, entry) {
  const emailLines = [
    'From: ' + senderEmail,
    'To: ' + entry.email,
    'Subject: Re: ' + entry.subject,
    'Content-Type: text/html; charset=utf-8',
    'In-Reply-To: ' + entry.messageId,
    'References: ' + entry.messageId,
    '',
    entry.body + EMAIL_SIGNATURE
  ];
  const encoded = Buffer.from(emailLines.join('\r\n'))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const draftBody = JSON.stringify({ message: { raw: encoded, threadId: entry.threadId } });
  const res = await httpsRequest({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/drafts',
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }
  }, draftBody);
  if (res.statusCode !== 200 && res.statusCode !== 201) throw new Error('Draft creation failed: ' + res.body);
  return JSON.parse(res.body);
}

async function logToSheet(accessToken, entry, event, notes) {
  try {
    const row = [
      new Date().toISOString(),
      entry.company, entry.domain, entry.founder, entry.email,
      event, 'Email ' + entry.emailNumber, entry.threadId, notes || ''
    ];
    const body = JSON.stringify({ values: [row] });
    const sheetPath = '/v4/spreadsheets/' + SHEET_ID + '/values/' +
      encodeURIComponent(SHEET_TAB + '!A:I') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
    const res = await httpsRequest({
      hostname: 'sheets.googleapis.com',
      path: sheetPath,
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, body);
    if (res.statusCode >= 200 && res.statusCode < 300) console.log('  Logged: ' + event);
    else console.log('  Warning: Sheet log returned ' + res.statusCode);
  } catch (err) {
    console.log('  Warning: Sheet log failed: ' + err.message);
  }
}

async function processEntry(accessToken, entry) {
  console.log('\n--- ' + entry.company + ' (Email ' + entry.emailNumber + ') ---');
  console.log('To: ' + entry.founder + ' <' + entry.email + '>');

  console.log('  Checking bounces...');
  if (await checkForBounces(accessToken, GMAIL_SENDER_EMAIL, entry.email)) {
    console.log('  BOUNCE detected. Skipping.');
    await logToSheet(accessToken, entry, 'BOUNCED', 'Bounce detected by scheduler');
    return 'bounced';
  }

  console.log('  Checking replies...');
  const replyCheck = await checkForReplies(accessToken, GMAIL_SENDER_EMAIL, entry.domain, entry.subject, entry.threadId);
  if (replyCheck.isBounce) {
    console.log('  BOUNCE detected via reply check. Skipping.');
    await logToSheet(accessToken, entry, 'BOUNCED', 'Bounce via reply check');
    return 'bounced';
  }
  if (replyCheck.hasReply) {
    console.log('  REPLY detected. Skipping.');
    await logToSheet(accessToken, entry, 'REPLIED', 'Cadence cancelled by scheduler');
    return 'replied';
  }

  console.log('  Creating draft...');
  const draft = await createDraft(accessToken, GMAIL_SENDER_EMAIL, entry);
  console.log('  Draft created: ' + draft.id);
  await logToSheet(accessToken, entry, 'FOLLOWUP_DRAFTED', 'Draft ID: ' + draft.id);
  return 'drafted';
}

async function main() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  console.log('=== Follow-up Scheduler ===');
  console.log('Today: ' + today);
  console.log('Total pending: ' + config.pending.filter(e => e.status === 'pending').length);

  const due = config.pending.filter(e => e.sendDate <= today && e.status === 'pending');
  if (due.length === 0) {
    console.log('No follow-ups due today.');
    return;
  }

  console.log('Due today: ' + due.length);

  const accessToken = await getAccessToken();
  let drafted = 0, replied = 0, bounced = 0, errored = 0;

  for (const entry of due) {
    try {
      const result = await processEntry(accessToken, entry);
      entry.status = result === 'drafted' ? 'completed' : result;
      entry.processedAt = new Date().toISOString();
      if (result === 'drafted') drafted++;
      else if (result === 'replied') replied++;
      else if (result === 'bounced') bounced++;
    } catch (err) {
      console.error('  ERROR processing ' + entry.company + ': ' + err.message);
      entry.status = 'error';
      entry.error = err.message;
      entry.processedAt = new Date().toISOString();
      errored++;
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('\n=== Summary ===');
  console.log('Drafted: ' + drafted + ', Replied: ' + replied + ', Bounced: ' + bounced + ', Errors: ' + errored);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
