#!/usr/bin/env node
/**
 * Install the database guard that refuses any out-of-turn market send.
 * See db/market_send_guard.sql.
 *
 *   node scripts/apply_send_guard.js
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

(async () => {
  const c = await connect();
  await c.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'market_send_guard.sql'), 'utf8'));
  const t = await c.query(`select tgname from pg_trigger where tgname = 'step_send_guard'`);
  console.log(t.rows.length ? 'send guard installed' : 'send guard NOT installed');
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
