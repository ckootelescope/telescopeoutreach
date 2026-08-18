#!/usr/bin/env node
// Re-mint the Google refresh token in .env.
//   node scripts/reauth_google.js
// Opens a browser, you click Allow, it writes GMAIL_REFRESH_TOKEN back to .env.
// Nothing is printed to the terminal except status - no tokens are echoed.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ENV_PATH = path.join(__dirname, '..', '.env');
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  // Weekly OS: read the calendar to plan around, write to-dos as Tasks so they
  // stay filterable apart from real meetings in Google Calendar.
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
].join(' ');

function readEnv() {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  raw.split(/\r?\n/).forEach(l => { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return { raw, env };
}

function writeRefreshToken(token) {
  const { raw } = readEnv();
  const lines = raw.split(/\r?\n/);
  let found = false;
  const out = lines.map(l => {
    if (/^\s*GMAIL_REFRESH_TOKEN\s*=/.test(l)) { found = true; return 'GMAIL_REFRESH_TOKEN=' + token; }
    return l;
  });
  if (!found) out.push('GMAIL_REFRESH_TOKEN=' + token);
  fs.writeFileSync(ENV_PATH, out.join('\n'));
}

function post(hostname, p, body) {
  return new Promise((res, rej) => {
    const r = https.request({ hostname, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ s: x.statusCode, b: d })); });
    r.on('error', rej); r.write(body); r.end();
  });
}

async function main() {
  const { env } = readEnv();
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) {
    console.error('GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET missing from .env');
    process.exit(1);
  }

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',            // forces a NEW refresh token every time
    include_granted_scopes: 'true',
  }).toString();

  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) { res.writeHead(404); res.end(); return; }
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get('code');
    const err = url.searchParams.get('error');

    if (err) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Denied</h2><p>' + err + '</p><p>You can close this tab.</p>');
      console.error('\nAuthorization denied: ' + err);
      server.close(); process.exit(1);
    }

    const body = new URLSearchParams({
      code, client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
      redirect_uri: REDIRECT, grant_type: 'authorization_code',
    }).toString();
    const tok = await post('oauth2.googleapis.com', '/token', body);

    if (tok.s !== 200) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Token exchange failed</h2><pre>' + tok.b.slice(0, 400) + '</pre>');
      console.error('\nToken exchange failed (HTTP ' + tok.s + '):');
      console.error(tok.b.slice(0, 400));
      server.close(); process.exit(1);
    }

    const j = JSON.parse(tok.b);
    if (!j.refresh_token) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>No refresh token returned</h2><p>Revoke access at myaccount.google.com/permissions and retry.</p>');
      console.error('\nGoogle returned an access token but no refresh token.');
      server.close(); process.exit(1);
    }

    writeRefreshToken(j.refresh_token);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Connected</h2><p>Refresh token saved to .env. You can close this tab.</p>');
    console.log('\nSUCCESS - GMAIL_REFRESH_TOKEN written to .env');
    console.log('scopes granted: ' + (j.scope || '(none reported)'));
    server.close();
    process.exit(0);
  });

  server.listen(PORT, () => {
    console.log('Listening on ' + REDIRECT);
    console.log('\nIf a browser does not open, paste this into one:\n');
    console.log(authUrl + '\n');
    const cmd = process.platform === 'win32' ? `start "" "${authUrl}"`
      : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
    exec(cmd, () => {});
  });

  setTimeout(() => { console.error('\nTimed out after 5 minutes.'); process.exit(1); }, 300000);
}

main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
