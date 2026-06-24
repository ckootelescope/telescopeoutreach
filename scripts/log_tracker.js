const https = require('https');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env = {};
envLines.forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const SHEET_ID = '1Sk9HndYNzXj_tHg8-T4EGqSqkPk1QKXH2UOQt23s7CA';
const SHEET_TAB = 'Activity Log';

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
    client_id: env.GMAIL_CLIENT_ID,
    client_secret: env.GMAIL_CLIENT_SECRET,
    refresh_token: env.GMAIL_REFRESH_TOKEN,
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

async function readExistingRows(accessToken) {
  const range = encodeURIComponent(SHEET_TAB + '!A:I');
  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: '/v4/spreadsheets/' + SHEET_ID + '/values/' + range,
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  if (res.statusCode !== 200) return [];
  const data = JSON.parse(res.body).values || [];
  return data.slice(1);
}

function getRepliedDomains(existingRows) {
  const domains = new Set();
  for (const row of existingRows) {
    if ((row[5] || '').trim() === 'REPLIED') {
      const key = (row[2] || row[1] || '').trim().toLowerCase();
      if (key) domains.add(key);
    }
  }
  return domains;
}

async function appendRows(accessToken, rows) {
  const body = JSON.stringify({ values: rows });
  const sheetPath = '/v4/spreadsheets/' + SHEET_ID + '/values/' +
    encodeURIComponent(SHEET_TAB + '!A:I') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: sheetPath,
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error('Sheets API error ' + res.statusCode + ': ' + res.body);
  }
  return JSON.parse(res.body);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node log_tracker.js \'<JSON array of entries>\'');
    console.log('Each entry: { company, domain, founder, email, event, email_stage, thread_id, notes, timestamp }');
    console.log('Example: node log_tracker.js \'[{"company":"Acme","domain":"acme.com","founder":"John","email":"john@acme.com","event":"SENT","email_stage":"Email 1","thread_id":"abc123"}]\'');
    process.exit(1);
  }

  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    console.error('Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN in .env');
    process.exit(1);
  }

  const entries = JSON.parse(args[0]);
  const accessToken = await getAccessToken();

  const existingRows = await readExistingRows(accessToken);
  const repliedDomains = getRepliedDomains(existingRows);

  const rows = [];
  const skipped = [];
  for (const e of entries) {
    const key = (e.domain || e.company || '').toLowerCase();
    if (e.event === 'REPLIED' && repliedDomains.has(key)) {
      skipped.push(e);
      continue;
    }
    if (e.event === 'REPLIED') repliedDomains.add(key);
    rows.push([
      e.timestamp || new Date().toISOString(),
      e.company || '', e.domain || '', e.founder || '', e.email || '',
      e.event || '', e.email_stage || '', e.thread_id || '', e.notes || ''
    ]);
  }

  if (skipped.length > 0) {
    console.log('Skipped ' + skipped.length + ' duplicate REPLIED:');
    skipped.forEach(e => console.log('  SKIPPED: ' + e.company + ' (already has REPLIED)'));
  }

  if (rows.length === 0) {
    console.log('No new rows to log (all duplicates).');
    return;
  }

  const result = await appendRows(accessToken, rows);
  console.log('Logged ' + rows.length + ' row(s) to tracker.');
  rows.forEach(r => console.log('  ' + r[5] + ': ' + r[1] + ' (' + r[3] + ')'));
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
