const https = require('https');

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_SENDER_EMAIL = process.env.GMAIL_SENDER_EMAIL;
const COMPANY_NAME = process.env.COMPANY_NAME;
const FOUNDER_NAME = process.env.FOUNDER_NAME;
const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL;
const COMPANY_DOMAIN = process.env.COMPANY_DOMAIN;
const ORIGINAL_THREAD_ID = process.env.ORIGINAL_THREAD_ID;
const ORIGINAL_MESSAGE_ID = process.env.ORIGINAL_MESSAGE_ID;
const EMAIL_SUBJECT = process.env.EMAIL_SUBJECT;
const EMAIL_BODY = process.env.EMAIL_BODY;
const EMAIL_NUMBER = process.env.EMAIL_NUMBER;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const OUTREACH_API_KEY = process.env.OUTREACH_API_KEY;

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

async function checkForReplies(accessToken) {
  const query = encodeURIComponent('to:' + GMAIL_SENDER_EMAIL + ' from:' + COMPANY_DOMAIN + ' in:anywhere');
  const res = await httpsRequest({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/messages?q=' + query + '&maxResults=10',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });

  if (res.statusCode !== 200) throw new Error('Message search failed: ' + res.body);
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
    const subject = getHeader('Subject') || '';
    const from = getHeader('From') || '';

    if (from.includes('mailer-daemon') || from.includes('postmaster') || subject.toLowerCase().includes('undeliverable')) {
      return { hasReply: false, isBounce: true };
    }
    if (autoSubmitted && autoSubmitted !== 'no') continue;
    if (xAutoreply === 'yes') continue;
    if (subject.toLowerCase().includes('out of office') || subject.toLowerCase().includes('automatic reply')) continue;

    if (subject.includes(EMAIL_SUBJECT.replace('Re: ', '')) || (ORIGINAL_THREAD_ID && msgData.threadId === ORIGINAL_THREAD_ID)) {
      return { hasReply: true, isBounce: false };
    }
  }
  return { hasReply: false, isBounce: false };
}

async function checkForBounces(accessToken) {
  const query = encodeURIComponent('from:(mailer-daemon OR postmaster) to:' + GMAIL_SENDER_EMAIL + ' subject:(delivery OR failure OR undeliverable) newer_than:14d');
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
    if (snippet.toLowerCase().includes(FOUNDER_EMAIL.toLowerCase())) return true;
  }
  return false;
}

async function createFollowUpDraft(accessToken) {
  const emailLines = [
    'From: ' + GMAIL_SENDER_EMAIL,
    'To: ' + FOUNDER_EMAIL,
    'Subject: Re: ' + EMAIL_SUBJECT,
    'Content-Type: text/html; charset=utf-8',
    'In-Reply-To: ' + ORIGINAL_MESSAGE_ID,
    'References: ' + ORIGINAL_MESSAGE_ID,
    '',
    EMAIL_BODY
  ];

  const encodedEmail = Buffer.from(emailLines.join('\r\n'))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const draftBody = JSON.stringify({ message: { raw: encodedEmail, threadId: ORIGINAL_THREAD_ID } });

  const res = await httpsRequest({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/drafts',
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }
  }, draftBody);

  if (res.statusCode !== 200 && res.statusCode !== 201) throw new Error('Draft creation failed: ' + res.body);
  return JSON.parse(res.body);
}

async function logToSheet(event, emailStage, notes) {
  if (!APPS_SCRIPT_URL || !OUTREACH_API_KEY) return;
  try {
    const url = new URL(APPS_SCRIPT_URL);
    const body = JSON.stringify({
      api_key: OUTREACH_API_KEY,
      action: 'log',
      timestamp: new Date().toISOString(),
      company: COMPANY_NAME,
      domain: COMPANY_DOMAIN,
      founder: FOUNDER_NAME,
      email: FOUNDER_EMAIL,
      event: event,
      email_stage: emailStage,
      thread_id: ORIGINAL_THREAD_ID,
      notes: notes || ''
    });
    await httpsRequest({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, body);
    console.log('Logged to sheet: ' + event);
  } catch (err) {
    console.log('Warning: Sheet logging failed: ' + err.message);
  }
}

async function main() {
  console.log('\n========================================');
  console.log('Follow-up Email ' + EMAIL_NUMBER + ' for ' + COMPANY_NAME);
  console.log('Target: ' + FOUNDER_NAME + ' (' + FOUNDER_EMAIL + ')');
  console.log('========================================\n');

  const fs = require('fs');

  try {
    console.log('Authenticating with Gmail...');
    const accessToken = await getAccessToken();
    console.log('Authenticated.\n');

    console.log('Checking for bounces...');
    if (await checkForBounces(accessToken)) {
      console.log('BOUNCE DETECTED for ' + FOUNDER_EMAIL);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'result=BOUNCED\n');
      await logToSheet('BOUNCED', 'Email ' + EMAIL_NUMBER, 'Bounce detected');
      return;
    }
    console.log('No bounces.\n');

    console.log('Checking for replies from ' + COMPANY_DOMAIN + '...');
    const replyCheck = await checkForReplies(accessToken);
    if (replyCheck.isBounce) {
      console.log('BOUNCE DETECTED via reply check.');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'result=BOUNCED\n');
      await logToSheet('BOUNCED', 'Email ' + EMAIL_NUMBER, 'Bounce via reply check');
      return;
    }
    if (replyCheck.hasReply) {
      console.log('REPLY DETECTED! Skipping follow-up.');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'result=REPLIED\n');
      await logToSheet('REPLIED', '', 'Cadence cancelled');
      return;
    }
    console.log('No replies.\n');

    console.log('Creating follow-up draft...');
    const draft = await createFollowUpDraft(accessToken);
    console.log('Draft created! ID: ' + draft.id);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'result=DRAFT_CREATED\n');
    await logToSheet('FOLLOWUP_DRAFTED', 'Email ' + EMAIL_NUMBER, 'Draft ID: ' + draft.id);

  } catch (error) {
    console.error('ERROR:', error.message);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'result=ERROR\n');
    process.exit(1);
  }
}

main();
