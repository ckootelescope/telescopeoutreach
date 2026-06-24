const https = require('https');
const fs = require('fs');

const env = {};
fs.readFileSync('.env', 'utf-8').split('\n').forEach(l => {
  const [k,...v] = l.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

function getAccessToken() {
  return new Promise((resolve) => {
    const postData = new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token'
    }).toString();
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d).access_token)); });
    req.write(postData); req.end();
  });
}

function getValues(token, range) {
  return new Promise((resolve) => {
    const sheetId = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
    const encodedRange = encodeURIComponent(range);
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + '/values/' + encodedRange,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.end();
  });
}

async function main() {
  const token = await getAccessToken();
  const result = await getValues(token, "'Monthly Break-In'!A2:F250");
  const rows = result.values || [];
  console.log('Total rows: ' + rows.length);
  rows.forEach((r, i) => {
    const num = r[0] || '';
    const month = r[1] || '';
    const company = r[2] || '';
    const website = r[3] || '';
    const oneLiner = r[4] || '';
    const status = r[5] || '';
    console.log((i+2) + '\t' + num + '\t' + month + '\t' + company + '\t' + website + '\t' + oneLiner + '\t' + status);
  });
}

main().catch(e => console.error(e));
