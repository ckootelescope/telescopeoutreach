const https = require('https');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
}

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
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
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

async function listDrafts(accessToken) {
  let allDrafts = [];
  let pageToken = '';
  do {
    const tokenParam = pageToken ? '&pageToken=' + pageToken : '';
    const res = await httpsRequest({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/drafts?maxResults=50' + tokenParam,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    if (res.statusCode !== 200) throw new Error('List drafts failed: ' + res.body);
    const data = JSON.parse(res.body);
    if (data.drafts) allDrafts = allDrafts.concat(data.drafts);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return allDrafts;
}

async function getDraftDetails(accessToken, draftId) {
  const res = await httpsRequest({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/drafts/' + draftId + '?format=metadata&metadataHeaders=Subject&metadataHeaders=To',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  if (res.statusCode !== 200) return null;
  return JSON.parse(res.body);
}

async function deleteDraft(accessToken, draftId) {
  const res = await httpsRequest({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/drafts/' + draftId,
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  return res.statusCode;
}

async function main() {
  const accessToken = await getAccessToken();

  console.log('Listing all drafts...');
  const drafts = await listDrafts(accessToken);
  console.log('Found ' + drafts.length + ' drafts total.\n');

  // Show all drafts with their details
  for (const draft of drafts) {
    const details = await getDraftDetails(accessToken, draft.id);
    if (details) {
      const headers = details.message.payload.headers || [];
      const subject = (headers.find(h => h.name === 'Subject') || {}).value || '(no subject)';
      const to = (headers.find(h => h.name === 'To') || {}).value || '(no recipient)';
      console.log('Draft ID: ' + draft.id + ' | Message ID: ' + draft.message.id + ' | To: ' + to + ' | Subject: ' + subject);
    }
  }

  // Delete all drafts
  console.log('\nDeleting all ' + drafts.length + ' drafts...');
  let deleted = 0, failed = 0;
  for (const draft of drafts) {
    const status = await deleteDraft(accessToken, draft.id);
    if (status === 204 || status === 200) {
      deleted++;
    } else {
      failed++;
      console.log('  FAILED (' + status + '): ' + draft.id);
    }
  }
  console.log('\nDone. Deleted: ' + deleted + ', Failed: ' + failed);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
