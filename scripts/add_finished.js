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

function updateValues(token, range, values) {
  return new Promise((resolve) => {
    const sheetId = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
    const body = JSON.stringify({ range, values, majorDimension: 'ROWS' });
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED',
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

function batchUpdate(token, requests) {
  return new Promise((resolve) => {
    const sheetId = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
    const body = JSON.stringify({ requests });
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets/' + sheetId + ':batchUpdate',
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.write(body); req.end();
  });
}

async function main() {
  const token = await getAccessToken();

  // 1. Read existing Finished Cadences
  const finResult = await getValues(token, "'Finished Cadences'!A1:C200");
  const finRows = (finResult.values || []).slice(1);
  const existingNames = new Set(finRows.map(r => (r[0] || '').toLowerCase().trim()));
  console.log('Existing in Finished Cadences: ' + finRows.length);

  // 2. Read Break-In "Cadence Complete" companies
  const breakin = await getValues(token, "'Monthly Break-In'!C3:D250");
  const breakinComplete = await getValues(token, "'Monthly Break-In'!C3:F250");
  const completeCompanies = [];
  (breakinComplete.values || []).forEach(r => {
    const company = (r[0] || '').trim();
    const domain = (r[1] || '').trim();
    const status = (r[3] || '').trim();
    if (company && status.includes('Cadence Complete')) {
      completeCompanies.push({ company, domain });
    }
  });
  console.log('Cadence Complete in Break-In: ' + completeCompanies.length);

  // 3. Read followups.json for email counts per company
  const followups = JSON.parse(fs.readFileSync('followups.json', 'utf-8'));
  const allEntries = [].concat(followups.pending || [], followups.completed || [], followups.cancelled || []);
  const emailCounts = {};
  allEntries.forEach(f => {
    const slug = f.slug;
    if (!slug) return;
    if (!emailCounts[slug]) emailCounts[slug] = 0;
    emailCounts[slug]++;
  });

  // 4. Find missing companies
  const missing = completeCompanies.filter(c => !existingNames.has(c.company.toLowerCase()));
  console.log('Missing from Finished Cadences: ' + missing.length);

  if (missing.length === 0) {
    console.log('Nothing to add.');
    return;
  }

  // 5. Build new rows with email counts
  const newRows = missing.map(c => {
    const slug = c.company.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const count = emailCounts[slug] || 4;
    return [c.company, c.domain, String(count)];
  }).sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));

  console.log('\nAdding ' + newRows.length + ' companies:');
  newRows.forEach(r => console.log('  ' + r.join(' | ')));

  // 6. Combine existing + new, sort alphabetically
  const allRows = [...finRows.map(r => [r[0], r[1], r[2]]), ...newRows]
    .sort((a, b) => (a[0] || '').toLowerCase().localeCompare((b[0] || '').toLowerCase()));

  // 7. Clear and rewrite entire tab
  const clearReq = {
    updateCells: {
      range: { sheetId: 521983420, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
      fields: 'userEnteredValue'
    }
  };
  await batchUpdate(token, [clearReq]);

  const range = "'Finished Cadences'!A2:C" + (2 + allRows.length - 1);
  const result = await updateValues(token, range, allRows);
  console.log('\nWritten: ' + (result.updatedCells || 0) + ' cells');
  console.log('Total companies in Finished Cadences: ' + allRows.length);
}

main().catch(e => console.error(e));
