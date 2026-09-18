/**
 * A mutex across the market-outreach jobs that talk to Gmail.
 *
 * This exists because of a specific failure: mo_nudge was run while mo_send was
 * mid-batch, the two together tripped Gmail's per-user rate limit, and two real
 * sends came back 429 and were recorded as failed. The sends and the drafts do
 * not compete for anything except quota, and quota is exactly the thing that
 * cannot be shared. So they take turns.
 *
 * Deliberately a file, not a database row: it must survive a killed process
 * without leaving a sequence wedged, and a stale lock expires on its own.
 */
const fs = require('fs');
const path = require('path');

const LOCK = path.join(__dirname, '..', '.mo-gmail.lock');
const STALE_MS = 6 * 3600e3;   // a send batch can legitimately run for hours

function read() {
  try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch { return null; }
}

/** Returns null on success, or a description of the holder. */
function acquire(who) {
  const cur = read();
  if (cur && Date.now() - cur.at < STALE_MS && cur.pid !== process.pid) {
    // Only trust the lock if that process is actually still alive.
    try { process.kill(cur.pid, 0); }
    catch { fs.rmSync(LOCK, { force: true }); return acquire(who); }
    return cur.who + ' (pid ' + cur.pid + ', since ' + new Date(cur.at).toISOString().slice(11, 19) + 'Z)';
  }
  fs.writeFileSync(LOCK, JSON.stringify({ who, pid: process.pid, at: Date.now() }));
  return null;
}

function release() {
  const cur = read();
  if (cur && cur.pid === process.pid) fs.rmSync(LOCK, { force: true });
}

module.exports = { acquire, release };
