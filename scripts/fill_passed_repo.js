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

const SHEET_ID = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
const TAB = "'Hard-To-Crack + CK Favorites'";

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

async function main() {
  const accessToken = await getAccessToken();

  const entries = [
    // Muse
    ['musesoftware.ai', 'Unified museum management platform (ticketing, CRM, fundraising)', 1],
    // Fireproof Tech
    ['fireprooftech.ai', 'AI records management and compliance for fire departments', 4],
    // Reviva
    ['joinreviva.com', 'EHR platform for wellness practices (scheduling, charting, payments)', 4],
    // Cervo AI
    ['usecervo.com', 'AI-powered customs brokerage automation', 2],
    // Bixby
    ['getbixby.com', 'AI copilot for commercial construction project management', 4],
    // Constructable
    ['constructable.ai', 'AI project management for commercial construction teams', 4],
    // Astrada
    ['astrada.co', 'AI-powered spend management platform', 4],
    // AlphaRun
    ['alpharun.com', 'AI-powered voice interviews for hiring at scale', 4],
    // Archouse Health
    ['archouse.health', 'AI-powered hospice operations automation', 4],
  ];

  const range = encodeURIComponent(TAB + '!B2:D10');
  const body = JSON.stringify({ values: entries });
  const sheetPath = '/v4/spreadsheets/' + SHEET_ID + '/values/' + range + '?valueInputOption=RAW';

  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: sheetPath,
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error('Sheets API error ' + res.statusCode + ': ' + res.body);
  }
  const result = JSON.parse(res.body);
  console.log('Updated Passed Repository: ' + result.updatedRows + ' rows, ' + result.updatedColumns + ' columns');
  console.log('Range: ' + result.updatedRange);
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
