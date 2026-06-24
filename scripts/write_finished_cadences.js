const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env = {};
envLines.forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const SHEET_ID = '1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
const TAB_NAME = 'Finished Cadences';

const DATA = [
  ['Advance', 'advance.ai', 2],
  ['Alpharun', 'alpharun.com', 3],
  ['APIContext', 'apicontext.com', 2],
  ['ArcHouse', 'archouse.ai', 3],
  ['Arcovo', 'arcovo.ai', 3],
  ['Astrada', 'astrada.ai', 2],
  ['Bixby', 'bixby.ai', 2],
  ['Boon', 'boon.ai', 2],
  ['Candid Wholesale', 'candidwholesale.com', 3],
  ['Cedar', 'cedar.ai', 2],
  ['Clipp', 'clipp.ai', 3],
  ['CognitiveView', 'cognitiveview.com', 3],
  ['Complement', 'complement.ai', 3],
  ['Constructable', 'constructable.ai', 3],
  ['Contractor Commerce', 'contractorcommerce.com', 3],
  ['ControlTheory', 'controltheory.ai', 3],
  ['Coolr', 'coolrgroup.com', 3],
  ['Corgea', 'corgea.com', 3],
  ['Corvera', 'corvera.ai', 3],
  ['Corvus', 'corvus.ai', 3],
  ['Cotool', 'cotool.ai', 3],
  ['DiversiFi', 'diversifi.com', 3],
  ['Entangl', 'entangl.ai', 3],
  ['Faction', 'faction.ai', 3],
  ['FlowGen Labs', 'flowgenlabs.com', 3],
  ['Flycore', 'flycore.ai', 3],
  ['Freeflow', 'freeflow.ai', 3],
  ['Freshline', 'freshline.io', 3],
  ['HeyPesto', 'heypesto.ai', 3],
  ['Hunted Labs', 'huntedlabs.com', 3],
  ['Kay', 'kay.ai', 3],
  ['Kipling Secure', 'kiplingsecure.ai', 3],
  ['LaborUp', 'laborup.com', 3],
  ['Magenta', 'magenta.ai', 3],
  ['MeltPlan', 'meltplan.com', 2],
  ['Nexcade', 'nexcade.ai', 3],
  ['Peasy', 'peasy.ai', 3],
  ['Procode', 'procode.ai', 3],
  ['Reform', 'reform.ai', 3],
  ['RepSpark', 'repspark.com', 3],
  ['Resourcly', 'resourcly.com', 3],
  ['RiskFront', 'riskfront.com', 3],
  ['Soff', 'soff.ai', 3],
  ['Specmade', 'specmade.com', 2],
  ['Streamlined', 'streamlined.ai', 3],
  ['Structured', 'structured.ai', 3],
  ['Superpanel', 'superpanel.io', 3],
  ['Turgon', 'turgon.ai', 3],
  ['TwinKnowledge', 'twinknowledge.com', 3],
  ['Walkway', 'walkway.ai', 3],
  ['WiseBee', 'wisebee.ai', 3],
  ['WorkHero', 'workhero.ai', 3],
  ['Wyre', 'wyre.ai', 3],
  ['Zoey', 'zoey.ai', 3],
];

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

async function getSheetMetadata(accessToken) {
  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: '/v4/spreadsheets/' + SHEET_ID + '?fields=sheets.properties',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  if (res.statusCode !== 200) throw new Error('Failed to get sheet metadata: ' + res.body);
  return JSON.parse(res.body);
}

async function addSheet(accessToken, title) {
  const body = JSON.stringify({
    requests: [{
      addSheet: {
        properties: { title: title }
      }
    }]
  });
  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: '/v4/spreadsheets/' + SHEET_ID + ':batchUpdate',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  if (res.statusCode !== 200) throw new Error('Failed to add sheet: ' + res.body);
  const result = JSON.parse(res.body);
  return result.replies[0].addSheet.properties.sheetId;
}

async function clearSheet(accessToken, range) {
  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: '/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent(range) + ':clear',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Content-Length': 2
    }
  }, '{}');
  if (res.statusCode !== 200) throw new Error('Failed to clear sheet: ' + res.body);
}

async function writeRows(accessToken, range, values) {
  const body = JSON.stringify({ values: values });
  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: '/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent(range) + '?valueInputOption=RAW',
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  if (res.statusCode !== 200) throw new Error('Sheets API write error ' + res.statusCode + ': ' + res.body);
  return JSON.parse(res.body);
}

async function main() {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    console.error('Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN in .env');
    process.exit(1);
  }

  console.log('Getting access token...');
  const accessToken = await getAccessToken();
  console.log('Access token obtained.');

  // Check if tab exists
  console.log('Checking if "' + TAB_NAME + '" tab exists...');
  const metadata = await getSheetMetadata(accessToken);
  const sheets = metadata.sheets || [];
  const sheetNames = sheets.map(s => s.properties.title);
  console.log('Existing tabs:', JSON.stringify(sheetNames));
  const tabExists = sheets.some(s => s.properties.title === TAB_NAME);

  if (!tabExists) {
    console.log('Tab not found. Creating "' + TAB_NAME + '"...');
    await addSheet(accessToken, TAB_NAME);
    console.log('Tab created.');
  } else {
    console.log('Tab already exists. Clearing existing data...');
    await clearSheet(accessToken, TAB_NAME + '!A:Z');
    console.log('Tab cleared.');
  }

  // Build rows: header + data
  const header = ['Company Name', 'Website', '# of Outreaches'];
  const allRows = [header, ...DATA];

  // Write all rows starting at A1
  const range = TAB_NAME + '!A1:C' + allRows.length;
  console.log('Writing ' + DATA.length + ' rows (plus header) to "' + TAB_NAME + '"...');
  const result = await writeRows(accessToken, range, allRows);
  console.log('Done. Updated range: ' + result.updatedRange);
  console.log('Rows written: ' + result.updatedRows);
  console.log('Cells updated: ' + result.updatedCells);
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
