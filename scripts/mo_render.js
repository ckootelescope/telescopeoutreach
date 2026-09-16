/**
 * Renders market-outreach emails. Shared by mo_enrich (preview) and mo_send
 * (the real thing) so what Calvin reviews is byte-identical to what goes out.
 * See market-outreach/SPEC.md
 */

const CALENDLY = 'https://calendly.com/calvin-telescopepartners/30min';

// Paragraph 3 of step 1. Locked across every project, every angle, every
// recipient. Do not parameterise this.
const P3 = "I recognize you're busy, but people we've spoken with have gained value from " +
  "learning about new market solutions and introductions that led to meaningful workflow " +
  "improvements. If there's another person on your team that you think would be a better fit - " +
  "happy to chat with them as well. LMK your thoughts and thanks in advance.";

const STEP3 = [
  "Hey [First] - following up again. Know that you're likely busy with a lot of other things, " +
  "but would appreciate the chance to hop on a quick virtual call even if it's just for 15 minutes.",
  "I do think it'll be mutually beneficial as we're open to sharing a lot of the new startups " +
  "that we've seen in the space building exceptional tools for your guys' workflows. Would be " +
  "also happy to help out in any other ways to return the favor, but LMK your thoughts!",
];

const STEP4_P2 = "Not trying to sell you on them as we're not investors ourselves, but the " +
  "purpose is really to understand whether this would be helpful to you or not as we think " +
  "about the market moving forward. LMK your thoughts - happy to be helpful however we can and " +
  "would love to speak with you!";

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Paragraphs to HTML, blank line between each. Matches the company engine. */
const P = paras => paras.map(p => '<div>' + p + '</div>').join('<div><br></div>');

/** Substitute the [Company] slot. */
const sub = (text, ctx) => String(text || '')
  .replace(/\[Company\]/g, esc(ctx.company_name || ''))
  .replace(/\[First\]/g, esc(ctx.first_name || ''))
  .replace(/\[industry\]/g, esc(ctx.industry || ''));

function subject(project) {
  return 'Telescope Partners | Chat on ' +
    (project.industry_label || project.industry) + ' Software and AI Tools';
}

/**
 * Step 1. Three paragraphs: greeting + the angle-specific ask + CTA, the frozen
 * per-angle paragraph 2, then the locked close.
 */
function step1(project, block, contact) {
  const ctx = { ...contact, industry: project.industry };
  const p1 = 'Hi ' + esc(contact.first_name) + ',';
  const ask = "Hope you don't mind the cold note! " + sub(block.para1_s2, ctx) +
    ' Are you free for a quick call in the next couple of weeks?';
  return P([p1, ask, sub(block.para2_html, ctx), P3]);
}

function step2(contact) {
  return P(['Hey ' + esc(contact.first_name) + ' - wanted to follow up - are you free for a chat ' +
    'next week? Here is my <a href="' + CALENDLY + '">calendar link</a> if helpful - would love to chat!']);
}

function step3(contact) {
  return P(STEP3.map(p => p.replace('[First]', esc(contact.first_name))));
}

/** Step 4 leads with the project-level insight, then the locked close. */
function step4(project, contact) {
  if (!project.fu3_insight_html) return null;   // caller must refuse to send
  const lead = 'Hey ' + esc(contact.first_name) + ' - wanted to try one more time. ' +
    project.fu3_insight_html;
  return P([lead, STEP4_P2]);
}

function render(stepNo, project, block, contact) {
  switch (Number(stepNo)) {
    case 1: return step1(project, block, contact);
    case 2: return step2(contact);
    case 3: return step3(contact);
    case 4: return step4(project, contact);
    default: throw new Error('bad step ' + stepNo);
  }
}

/** Strip tags for a readable console preview. */
const toText = html => String(html || '')
  .replace(/<div><br><\/div>/g, '\n\n')
  .replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
  .replace(/<\/div>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();

/**
 * Last line of defence before a send. The anchor company must never reach a
 * recipient, and Calvin treats an em dash as a dealbreaker.
 */
function guard(html, project) {
  const text = toText(html);
  const problems = [];
  const anchor = String(project.anchor_company || '').trim();
  if (anchor.length >= 3 &&
      new RegExp('\\b' + anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) {
    problems.push('anchor company "' + anchor + '" appears in the body');
  }
  if (/--|—|–/.test(text)) problems.push('contains an em dash or --');
  if (/\[Company\]|\[First\]|\[industry\]/.test(text)) problems.push('unfilled template slot');
  if (/\bBest,\s*$|\bCalvin\s*$/.test(text)) problems.push('looks like it has a sign-off');
  return problems;
}

module.exports = { render, subject, guard, toText, CALENDLY, P3 };
