#!/usr/bin/env node
/**
 * restart_cadence.js - schedule a Round 2 (restart) cadence in followups.json
 *
 * Round 2 cadence is Day 0 / +2 / +5 / +10 measured from the day Calvin sends Email 1.
 * Email 1 is sent by hand and never stored (same convention as Round 1), so this script
 * writes entries for Emails 2, 3, and 4 only.
 *
 *   Email 2 (+2)  - personalized, body generated at due time from the cached dossier
 *   Email 3 (+5)  - personalized, body generated at due time from the cached dossier
 *   Email 4 (+10) - fixed template, body written here
 *
 * Usage:
 *   node scripts/restart_cadence.js --slug obin --company Obin --founder "Apoorv Saxena" \
 *     --email apoorv@obin.ai --domain obin.ai --sendDate 2026-08-04 [--dry-run]
 *
 * Subject is fixed for Round 2 and does not vary by company.
 */

const fs = require('fs');
const path = require('path');

const FOLLOWUPS = path.join(__dirname, '..', 'followups.json');
const ROUND2_SUBJECT = "Telescope Intro (Sequoia Spinout) - Let's Chat?";
const OFFSETS = { 2: 2, 3: 5, 4: 10 };

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a.startsWith('--')) { out[a.slice(2)] = argv[++i]; }
  }
  return out;
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function firstName(full) {
  return String(full || '').trim().split(/\s+/)[0] || '';
}

/**
 * Email 4 - fixed template. Only the founder's first name and the company name vary.
 * Text is preserved verbatim from Calvin's saved template.
 */
function email4Body(founder, company) {
  const fn = firstName(founder);
  const paras = [
    `Hey ${fn} - know I've followed up now a few times, but hopefully the persistence has conveyed our interest in ${company}.`,
    `As I mentioned, I'm very interested in what you're building and I think we'd be able to add value as an investment partner. I'd love to hear your feedback on whether there may be better timing, if you have other partners in mind, etc.`,
    `Know as a founder you're busy with a lot of things, so will find a time to reach back out later if I don't hear back. LMK your thoughts and if a chat in the next couple of weeks makes sense!`,
  ];
  return paras.map((p) => `<div>${p}</div>`).join('<div><br></div>');
}

function main() {
  const args = parseArgs(process.argv);
  const required = ['slug', 'company', 'founder', 'email', 'domain', 'sendDate'];
  const missing = required.filter((k) => !args[k]);
  if (missing.length) {
    console.error(`Missing required args: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.sendDate)) {
    console.error(`--sendDate must be YYYY-MM-DD, got "${args.sendDate}"`);
    process.exit(1);
  }

  const raw = fs.readFileSync(FOLLOWUPS, 'utf8');
  const config = JSON.parse(raw);
  const pending = config.pending;
  // Preserve whatever trailing-newline convention the file already uses, so writing
  // never produces a spurious whole-file diff.
  const trailingNewline = raw.endsWith('\n') ? '\n' : '';

  // Guard: never double-schedule a round for the same company.
  const existingR2 = pending.filter((e) => e.slug === args.slug && e.round === 2);
  if (existingR2.length) {
    console.error(
      `Round 2 already scheduled for "${args.slug}" (${existingR2.length} entries, ` +
      `statuses: ${[...new Set(existingR2.map((e) => e.status))].join('/')}). Nothing written.`
    );
    process.exit(1);
  }

  // Guard: a founder who ever replied should not be restarted.
  // `repliedAt` is set when a reply is detected on a cadence that had already finished, where
  // overwriting status would erase the record that the emails actually went out. Both count.
  const replied = pending.filter(
    (e) => e.slug === args.slug && (e.status === 'replied' || e.repliedAt)
  );
  if (replied.length) {
    const when = replied.find((e) => e.repliedAt)?.repliedAt;
    console.error(
      `"${args.slug}" has ${replied.length} entr${replied.length === 1 ? 'y' : 'ies'} ` +
      `marking a reply${when ? ' (repliedAt ' + when.slice(0, 10) + ')' : ''}. ` +
      `Restarting a founder who already responded is almost certainly wrong. Nothing written.`
    );
    process.exit(1);
  }

  const entries = [2, 3, 4].map((n) => {
    const base = {
      slug: args.slug,
      company: args.company,
      founder: args.founder,
      email: args.email,
      domain: args.domain,
      threadId: null,
      superhumanThreadId: null,
      messageId: null,
      subject: ROUND2_SUBJECT,
      emailNumber: n,
      round: 2,
      sendDate: addDays(args.sendDate, OFFSETS[n]),
      status: 'pending',
    };
    if (n === 4) {
      return { ...base, body: email4Body(args.founder, args.company) };
    }
    // Emails 2 and 3 are drafted at due time from research/<slug>.json
    return { ...base, body: null, needsDraft: true };
  });

  console.log(`Round 2 cadence for ${args.company} (${args.founder} <${args.email}>)`);
  console.log(`  Email 1  ${args.sendDate}  (sent by hand, not stored)`);
  for (const e of entries) {
    const kind = e.needsDraft ? 'personalized, drafted at due time' : 'fixed template';
    console.log(`  Email ${e.emailNumber}  ${e.sendDate}  ${kind}`);
  }
  console.log(`  Subject: ${ROUND2_SUBJECT}`);

  if (args.dryRun) {
    console.log('\n--dry-run: nothing written.');
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  pending.push(...entries);
  fs.writeFileSync(FOLLOWUPS, JSON.stringify(config, null, 2) + trailingNewline);
  console.log(`\nWrote 3 entries to followups.json. Commit and push before the next scheduler run.`);
}

main();
