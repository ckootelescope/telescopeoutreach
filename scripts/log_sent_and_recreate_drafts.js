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

async function appendToSheet(accessToken, rows) {
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
  if (res.statusCode >= 200 && res.statusCode < 300) {
    console.log('Logged ' + rows.length + ' rows to sheet');
  } else {
    console.log('Sheet logging failed (' + res.statusCode + '): ' + res.body);
  }
}

async function createDraft(accessToken, entry) {
  const emailLines = [
    'From: ' + process.env.GMAIL_SENDER_EMAIL,
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
  if (res.statusCode !== 200 && res.statusCode !== 201) throw new Error('Draft failed for ' + entry.company + ': ' + res.body);
  return JSON.parse(res.body);
}

async function main() {
  const accessToken = await getAccessToken();
  const now = new Date().toISOString();

  // ===== PART 1: Log SENT events to Sheet =====
  console.log('\n=== Logging SENT events to Google Sheet ===\n');

  const sentEvents = [
    // Email 3s Calvin manually sent on May 26
    [now, 'Advance', 'advancehq.com', 'Omer Rimoch', 'omer@advancehq.com', 'SENT', 'Email 3', '19e3c34b27d9707e', 'Calvin sent manually'],
    [now, 'APIContext', 'apicontext.com', 'Mayur Upadhyaya', 'mayur@apicontext.com', 'SENT', 'Email 3', '19e3d12592b0d401', 'Calvin sent manually'],
    [now, 'Astrada', 'astrada.co', 'Salman Syed', 'salman@astrada.co', 'SENT', 'Email 3', '19e41e29c9699214', 'Calvin sent manually'],
    [now, 'Bixby', 'getbixby.com', 'Shaw', 'sm@getbixby.com', 'SENT', 'Email 3', '19e42d932f492836', 'Calvin sent manually'],
    [now, 'Boon', 'getboon.ai', 'Deepti', 'deepti@getboon.ai', 'SENT', 'Email 3', '19e4297ea4296edc', 'Calvin sent manually'],
    [now, 'Cedar', 'cedar.build', 'Kyle', 'kyle@cedar.build', 'SENT', 'Email 3', '19e42a44baff48ca', 'Calvin sent manually'],
    // Email 2s Calvin sent on May 26
    [now, 'Zoey', 'zoey.com', 'Uri', 'uri@zoey.com', 'SENT', 'Email 2', '19e52cb3e699df5e', ''],
    [now, 'HeyPesto', 'heypesto.ai', 'Kate', 'kate@heypesto.ai', 'SENT', 'Email 2', '19e52c733e343d50', ''],
    [now, 'Walkway', 'walkway.ai', 'Brent', 'brent@walkway.ai', 'SENT', 'Email 2', '19e5204f19d6d418', ''],
    [now, 'Procode', 'tryprocode.com', 'Jeff', 'jeff@tryprocode.com', 'SENT', 'Email 2', '19e520b263b199e0', ''],
    [now, 'Magenta', 'withmagenta.com', 'Dave', 'dave@withmagenta.com', 'SENT', 'Email 2', '19e51952b28a532f', ''],
    [now, 'Streamlined', 'streamlinedpayments.com', 'Boris', 'boris@streamlinedpayments.com', 'SENT', 'Email 2', '19e4d1a1b1d63cdf', ''],
    [now, 'RepSpark', 'repspark.com', 'Meghann Butcher', 'meghann.butcher@repspark.com', 'SENT', 'Email 2', '19e4d197f15f5ed6', ''],
    [now, 'Candid Wholesale', 'candidwholesale.com', 'Dave', 'dave@candidwholesale.com', 'SENT', 'Email 2', '19e4d1868dde3a31', ''],
    [now, 'Flycore', 'getflycore.com', 'Doug', 'doug@getflycore.com', 'SENT', 'Email 2', '19e4d16d2e7410a2', ''],
    [now, 'Superpanel', 'superpanel.io', 'Julien', 'julien@superpanel.io', 'SENT', 'Email 2', '19e4d1680c970d0c', ''],
    [now, 'ArcHouse', 'archouse.health', 'Paul', 'paul@archouse.health', 'SENT', 'Email 2', '19e4d1528dadd937', ''],
    // Claimlane REPLIED
    [now, 'Claimlane', 'claimlane.com', 'Anders Sommer Larsen', 'asl@claimlane.com', 'REPLIED', 'Email 1', '19e6067554f12d31', 'Anders replied - raising, meeting booked Thu 5/28 8:30am PT'],
  ];

  await appendToSheet(accessToken, sentEvents);
  console.log('Logged ' + sentEvents.length + ' events (17 SENT + 1 REPLIED)');

  // ===== PART 2: Recreate 5 Email 2 drafts =====
  console.log('\n=== Recreating 5 Email 2 drafts ===\n');

  const draftsToCreate = [
    {
      company: 'Coolr',
      email: 'durlabh@coolrgroup.com',
      threadId: '19e5b5b719da4008',
      messageId: '19e5b5b719da4008',
      subject: 'Telescope <> Coolr Reconnect',
      body: '<div>Hey Durlabh, I was looking at the VistaZ camera setup and I think the retrofit approach is smart. No wires, no plugs, just peel and stick inside an existing cooler. That removes the biggest barrier to getting deployed at scale. I\'d be curious how the conversation changes once brands like Heineken or Carlsberg start seeing the sell-out data. Does it shift from "we need better availability" to "we want to use this for assortment planning and shelf optimization"?</div>'
    },
    {
      company: 'Nexcade',
      email: 'dan@nexcade.ai',
      threadId: '19e5b47e5f4719da',
      messageId: '19e5b47e5f4719da',
      subject: 'Telescope Partners <> Nexcade Intro',
      body: '<div>Hey Dan, I read the FreightWaves piece about Nexcade and the insight that forwarders were taking automated data and putting it back into spreadsheets really stood out. I think that\'s the right problem to build around. Chris has worked with companies like Parabola and Project44 so we spend a lot of time in supply chain. Curious whether you\'re seeing more pull from mid-market forwarders or whether the larger players like XPO are driving adoption.</div>'
    },
    {
      company: 'Freshline',
      email: 'robert@freshline.io',
      threadId: '19e5b4220e25fda6',
      messageId: '19e5b4220e25fda6',
      subject: 'Telescope <> Freshline Intro',
      body: '<div>Hey Robert, I was looking at the AI ordering feature where customers can just text something like "50 lbs Atlantic salmon for Friday" and the system handles the catch-weight pricing and confirmation automatically. That\'s a clever way to digitize ordering without forcing a behavior change. Curious whether most of your 100+ distributors started with the AI ordering piece or the storefront, and how the adoption path typically plays out.</div>'
    },
    {
      company: 'Reform',
      email: 'omar@reformhq.com',
      threadId: '19e5ba366cfa3fdd',
      messageId: '19e5ba366cfa3fdd',
      subject: 'Telescope Partners <> Reform',
      body: '<div>Hey Omar, I was looking at the customer numbers on your site, 20M+ tasks automated and 250K+ hours saved is serious traction. The drag-and-drop workflow builder approach makes sense for logistics ops teams that need to move fast without waiting on engineering. Chris has worked with companies like Parabola and Project44 so we have good context on how supply chain companies adopt new tools. Curious whether most customers start with document extraction and expand from there, or if they come in for a specific workflow like AP or customs declarations.</div>'
    },
    {
      company: 'Peasy',
      email: 'ryan@peasyos.com',
      threadId: '19e5ba80b66a6794',
      messageId: '19e5ba80b66a6794',
      subject: 'Telescope <> Peasy Intro | CPG Deep Dive',
      body: '<div>Hey Ryan, I saw the Shelf Engine background for you and Bryan, and I think that experience gives you a real edge in understanding how CPG operators actually manage inventory day to day. The free tier is an interesting GTM decision. Curious whether that\'s driving organic adoption or if most brands are finding you through the Shopify/QuickBooks ecosystem.</div>'
    }
  ];

  for (const entry of draftsToCreate) {
    try {
      const draft = await createDraft(accessToken, entry);
      console.log('Draft created: ' + entry.company + ' (ID: ' + draft.id + ')');
    } catch (err) {
      console.error('FAILED ' + entry.company + ': ' + err.message);
    }
  }

  console.log('\nDone!');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
