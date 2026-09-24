#!/usr/bin/env node
/**
 * One Gmail call, to learn whether the per-user rate limit has lifted.
 *
 *   node scripts/gmail_probe.js      exit 0 clear, 75 still throttled, 1 other failure
 *
 * tick.js runs this, and only this, after a throttle backoff expires. Sending a
 * full job instead would make a dozen calls into a live throttle, and every call
 * made during one restarts Google's 15-minute penalty. That is how a single bad
 * morning on 2026-09-24 kept the mailbox locked for hours.
 *
 * Exactly one request: gmail_req's token refresh goes to oauth2.googleapis.com,
 * which has its own quota, and users/me/profile is the cheapest Gmail read.
 */
const https = require('https');
const { token } = require('./gmail_req');

(async () => {
  const t = await token();
  const r = await new Promise((resolve, reject) => {
    https.get({ hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/profile',
      headers: { Authorization: 'Bearer ' + t } }, res => {
      let b = '';
      res.on('data', d => (b += d));
      res.on('end', () => resolve({ s: res.statusCode, b }));
    }).on('error', reject);
  });
  if (r.s === 200) { console.log('gmail clear'); return; }
  console.log('gmail probe HTTP ' + r.s + ': ' + r.b.replace(/\s+/g, ' ').slice(0, 200));
  process.exitCode = r.s === 429 || /rateLimitExceeded|quota/i.test(r.b) ? 75 : 1;
})().catch(e => { console.error('ERR ' + e.message); process.exitCode = 1; });
