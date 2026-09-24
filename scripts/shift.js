#!/usr/bin/env node
/**
 * The robot's shift. One GitHub Actions run stays up and ticks on the wall clock,
 * instead of waiting for GitHub's scheduler to start a fresh run every 15 minutes.
 *
 *   node scripts/shift.js            tick every 15 min until the shift ends
 *   node scripts/shift.js --dry      print the plan, run nothing
 *
 * Why: GitHub's cron is best-effort. In this repo it started every July run
 * 51 minutes to 2h39m late, and on 2026-09-24 it skipped every 15-minute slot from
 * 7am to 9am Pacific. A 15-minute cadence cannot sit on that queue. So the cron
 * only restarts a dead chain now; the timing lives here.
 *
 * A shift ends at SHIFT_MAX (under GitHub's 6h job limit) or when the working
 * window closes, whichever comes first. On a SHIFT_MAX exit it writes next=true
 * to $GITHUB_OUTPUT and the workflow dispatches the successor run. A window exit
 * writes next=false and the chain rests overnight until a morning cron restarts it.
 *
 * A failed tick never ends the shift. tick.js already records every job in
 * job_run, and the next tick is 15 minutes away.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');

const TICK_MIN = 15;
const SHIFT_MAX_MS = 5 * 3600e3 + 40 * 60e3;   // job timeout is 355 min
const WINDOW = { open: 6 * 60, close: 20 * 60 };  // minutes after midnight Pacific
const HEALTH_AT = 7 * 60 + 30;                   // the daily pulse, 07:30 Pacific
const MAX_EARLY_WAIT_MS = 2 * 3600e3;            // started before open: wait at most this

const started = Date.now();
const deadline = started + SHIFT_MAX_MS;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Pacific wall clock for a timestamp: weekday 0-6 and minutes after midnight. */
function pacific(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day, min: +p.hour * 60 + +p.minute };
}

const weekday = ms => { const d = pacific(ms).day; return d >= 1 && d <= 5; };
const inWindow = ms => { const { min } = pacific(ms); return weekday(ms) && min >= WINDOW.open && min < WINDOW.close; };

/** Next wall-clock quarter hour strictly after ms. */
const nextSlot = ms => (Math.floor(ms / (TICK_MIN * 60e3)) + 1) * TICK_MIN * 60e3;

function output(next) {
  console.log('successor: ' + (next ? 'yes' : 'no'));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `next=${next}\n`);
}

function tick(args = []) {
  const r = spawnSync(process.execPath, ['scripts/tick.js', ...args], { cwd: ROOT, stdio: 'inherit', timeout: 13 * 60e3 });
  return r.status;
}

async function healthDue() {
  if (pacific(Date.now()).min < HEALTH_AT) return false;
  const c = await connect();
  try {
    const r = await c.query(`
      select 1 from job_run
       where job = 'health' and status <> 'running'
         and (started_at at time zone 'America/Los_Angeles')::date
           = (now() at time zone 'America/Los_Angeles')::date
       limit 1`);
    return r.rowCount === 0;
  } finally { await c.end(); }
}

async function main() {
  let next = false;
  try {
    // Started early by a restart cron: hold the runner until the window opens,
    // so the day starts on time even when GitHub delivers the cron late or early.
    if (!inWindow(Date.now()) && weekday(Date.now())) {
      let t = nextSlot(Date.now());
      while (!inWindow(t) && t - Date.now() <= MAX_EARLY_WAIT_MS) t = nextSlot(t);
      if (inWindow(t)) {
        console.log('window opens at ' + new Date(t).toISOString() + ', waiting');
        if (!DRY) await sleep(t - Date.now());
      }
    }
    if (!inWindow(Date.now())) {
      console.log('outside the working window, nothing to do');
      return;
    }

    for (;;) {
      console.log('\n=== tick ' + new Date().toISOString());
      if (DRY) console.log('would run: node scripts/tick.js');
      else {
        tick();
        try { if (await healthDue()) tick(['--job=health']); }
        catch (e) { console.log('health check skipped: ' + e.message); }
      }

      const t = nextSlot(Date.now());
      if (!inWindow(t)) { console.log('window closes, shift over'); return; }
      if (t > deadline) { next = true; console.log('shift limit reached'); return; }
      if (DRY) { console.log('next tick ' + new Date(t).toISOString()); next = true; return; }
      await sleep(t - Date.now());
    }
  } finally {
    output(next);
  }
}

main().catch(e => { console.error('ERR ' + e.message); process.exitCode = 1; });
