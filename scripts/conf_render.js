#!/usr/bin/env node
/**
 * Render the ITC Vegas 2026 conference sequence from conferences/itc-vegas-2026.json.
 *
 *   node scripts/conf_render.js            plain-text review of every email
 *   node scripts/conf_render.js --html     the HTML bodies, ready for Superhuman
 *   node scripts/conf_render.js --step=1   just one step
 *   node scripts/conf_render.js --slug=cara
 *
 * This is a conference sequence, not Round 1 or Round 2. It is three emails
 * rather than four, the cadence is pinned to the show dates rather than to day
 * offsets, and the opener changes depending on whether anyone at Telescope has
 * written to the company before. Blocks 1 and 3 are fixed; the middle paragraph
 * is the only variable part and lives in the JSON.
 *
 * The guard is the same one the market-outreach engine uses, because the
 * failure modes are identical: an em dash, an unfilled slot, a double space
 * from an empty substitution, or an accidental sign-off on top of Superhuman's.
 */
const fs = require('fs');
const path = require('path');
const { guard, toText } = require('./mo_render');

const DATA = path.join(__dirname, '..', 'conferences', 'itc-vegas-2026.json');
const HTML = process.argv.includes('--html');
const stepArg = process.argv.find(a => a.startsWith('--step='));
const slugArg = process.argv.find(a => a.startsWith('--slug='));
const ONLY_STEP = stepArg ? Number(stepArg.slice(7)) : null;
const ONLY_SLUG = slugArg ? slugArg.slice(7) : null;

const P = paras => paras.map(p => '<div>' + p + '</div>').join('<div><br></div>');

/**
 * Block 1. Three variants, because "know I've reached out before" is false for
 * the ten companies nobody at Telescope has ever written to, and false in a
 * different way for Braven, who send us their investor updates unprompted.
 */
const FUND = "For context on us, we're an early growth (Seed-Series B) VC firm investing out of our third fund " +
  "($275M). We were started by a former Sequoia partner and take a very concentrated approach by investing in a " +
  "select number of enterprise AI and software companies from each fund.";

function block1(c) {
  const ask = "are you free to grab a coffee and chat?";
  if (c.opener === 'braven') {
    return "Hey " + c.first + " - been following the " + c.display_name + " updates for a while now, and my " +
      "Principal Chris and I will both be at ITC next week, so " + ask + " " + FUND;
  }
  if (c.opener === 'new') {
    return "Hey " + c.first + " - my Principal Chris and I will be at ITC next week and wanted to reach out, " +
      ask + " " + FUND;
  }
  return "Hey " + c.first + " - know I've reached out before, but my Principal Chris and I will be at ITC next " +
    "week, " + ask + " " + FUND;
}

/** Block 2. The earned position is fixed; the pattern and the tie-in come from the JSON. */
function block2(c) {
  return "I spend most of my time across vertical AI and have been spending a ton of time in insurance these " +
    "days. " + c.insight;
}

/** Block 3. Fixed. The booth line lives here only, not in the opener as well. */
const BLOCK3 = "Would love to chat about how Telescope can help out with what you're building, LMK if you're " +
  "free to meet up and happy to stop by your booth if you have one as well!";

function step1(c) { return P([block1(c), block2(c), BLOCK3]); }

/** Step 2 and 3 are Calvin's fixed conference templates, reply-threaded. */
function step2(c) {
  return P(["Hey " + c.first + " - wanted to follow up. Are you free to meet up at the conference? Happy to " +
    "work around your schedule if you have a few minutes in between meetings, LMK your thoughts!"]);
}

function step3(c) {
  // "following you guys for a while now" is only true where somebody has
  // actually been in touch, so the never-contacted variant drops that clause
  // rather than asserting a relationship that does not exist.
  const tail = c.opener === 'new'
    ? "As mentioned, I really like what you're building with " + c.display_name + "."
    : "As mentioned, I really like what you're building with " + c.display_name +
      " and have been following you guys for a while now.";
  return P([
    "Hey " + c.first + " - wanted to follow up again. Know customer meetings come #1, but I'd love to meet you " +
      "even if for 5 minutes to set up some time to chat down the line. " + tail,
    "I think our experience with businesses around your stage can be particularly valuable, and would love to " +
      "introduce myself to see how we can be helpful in the meantime as you think about your next partner. LMK " +
      "your thoughts!",
  ]);
}

const RENDER = { 1: step1, 2: step2, 3: step3 };

function main() {
  const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let clean = 0;
  const problems = [];

  for (const c of d.contacts) {
    if (ONLY_SLUG && c.slug !== ONLY_SLUG) continue;
    for (const n of [1, 2, 3]) {
      if (ONLY_STEP && n !== ONLY_STEP) continue;
      const html = RENDER[n](c);
      // anchor_company is empty: there is no third-party company to leak here,
      // unlike the market engine where the anchor must never reach a recipient.
      const g = guard(html, { anchor_company: '' });
      if (g.length) problems.push('E' + n + '  ' + c.company + ': ' + g.join('; '));
      else clean++;

      console.log('=== E' + n + '  ' + c.company + '  ' + (c.email || 'NO EMAIL') +
                  '  due ' + d.cadence['e' + n] + (n === 1 ? '  [' + c.opener + ']' : ''));
      if (n === 1) console.log('Subject: ' + d.subject);
      console.log(HTML ? html : toText(html));
      if (g.length) console.log('!! GUARD: ' + g.join('; '));
      console.log('');
    }
  }

  console.log('---');
  console.log('contacts: ' + d.contacts.length + '   emails rendered clean: ' + clean);
  if (problems.length) {
    console.log('GUARD FAILURES (' + problems.length + ')');
    problems.forEach(p => console.log('  ' + p));
    process.exitCode = 1;
  }
}

main();
