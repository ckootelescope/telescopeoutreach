#!/usr/bin/env node
/**
 * Apply the market.v_due definition from db/heartbeat.sql, then show what the
 * next tick would send. The view carries the sending rules, so applying it takes
 * effect on the robot's next tick with no redeploy.
 *
 *   node scripts/apply_due_guard.js
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'heartbeat.sql'), 'utf8');
  const start = sql.indexOf('create or replace view market.v_due');
  const end = "project priority first.';";
  const stop = sql.indexOf(end, start);
  if (start < 0 || stop < 0) throw new Error('v_due definition not found in db/heartbeat.sql');
  const c = await connect();
  await c.query(sql.slice(start, stop + end.length));
  const next = await c.query(`select project_slug, full_name, step_no, due_date::text from market.v_due`);
  console.log('v_due applied. next tick would send:');
  console.table(next.rows);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
