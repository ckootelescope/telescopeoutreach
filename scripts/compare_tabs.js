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
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent(range),
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.end();
  });
}

async function main() {
  const token = await getAccessToken();

  // Read Monthly Break-In: columns C (company), D (website), F (status)
  const breakin = await getValues(token, "'Monthly Break-In'!A3:F250");
  const breakinRows = (breakin.values || []).filter(r => r[2]);
  const cadenceComplete = breakinRows.filter(r => (r[5] || '').includes('Cadence Complete'));
  console.log('Monthly Break-In total: ' + breakinRows.length);
  console.log('Cadence Complete: ' + cadenceComplete.length);
  console.log('Active Cadence: ' + breakinRows.filter(r => (r[5] || '').includes('Active')).length);

  // Read Finished Cadences tab
  const finished = await getValues(token, "'Finished Cadences'!A2:F200");
  const finishedRows = (finished.values || []).filter(r => r[0]);
  console.log('\nFinished Cadences tab rows: ' + finishedRows.length);

  // Build set of companies already in Finished Cadences (by company name)
  const finishedCompanies = new Set();
  finishedRows.forEach(r => {
    const company = (r[1] || '').trim();
    if (company) finishedCompanies.add(company.toLowerCase());
  });

  // Find Cadence Complete companies NOT in Finished Cadences
  const missing = [];
  cadenceComplete.forEach(r => {
    const company = (r[2] || '').trim();
    const domain = (r[3] || '').trim();
    if (!finishedCompanies.has(company.toLowerCase())) {
      missing.push({ company, domain });
    }
  });

  console.log('\nMissing from Finished Cadences: ' + missing.length);
  missing.forEach(m => console.log('  ' + m.company + ' (' + m.domain + ')'));

  // Also show what's in Finished Cadences for reference
  console.log('\nFinished Cadences companies:');
  finishedRows.forEach(r => console.log('  ' + (r[1] || '') + ' | ' + (r[2] || '')));
}

main().catch(e => console.error(e));
