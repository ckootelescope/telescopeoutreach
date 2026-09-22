/**
 * Renders market-outreach emails. Shared by mo_enrich (preview) and mo_send
 * (the real thing) so what Calvin reviews is byte-identical to what goes out.
 * See market-outreach/SPEC.md
 */

const CALENDLY = 'https://calendly.com/calvin-telescopepartners/30min';

// Default paragraph 3 of step 1. It was originally locked across every project
// and angle, and for the buyer-facing angles it still is. The 'former' angle
// broke that: once the recipient is no longer a buyer, "you'll hear about new
// market solutions" is the wrong offer, so a block may override it via
// copy_block.para3_html. Null there means use this.
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

// The step-1 ask, when the project has not overridden it. A conference makes
// the ask specific and dated, which is why cta_html exists.
const CTA = 'Are you free for a quick call in the next couple of weeks?';

// Contact beats project beats default. A batch can carry its own framing (a
// conference, a city visit) without retitling everyone else on the project.
function subject(project, contact) {
  if (contact && contact.subject_override) return contact.subject_override;
  if (project.subject_override) return project.subject_override;
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
    ' ' + sub(contact.cta_html || project.cta_html || CTA, ctx);
  return P([p1, ask, sub(block.para2_html, ctx), sub(block.para3_html || P3, ctx)]);
}

function step2(contact) {
  // A cohort can override this. The fixed template offers a calendar link for
  // "next week", which is the wrong ask when the whole cadence runs inside a
  // conference and the meeting is meant to happen in person.
  if (contact.step2_html) return P([sub(contact.step2_html, contact)]);
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
  // A slot filled with an empty string is worse than one left unfilled: it
  // reads as a typo rather than a bug. "carriers like  speed up how policies
  // move" is what an empty [Company] produces, and it looks careless to the
  // recipient. The leftover double space is the tell.
  if (/ {2,}/.test(text)) problems.push('double space, likely an empty [Company] or [First] substitution');
  if (/\bBest,\s*$|\bCalvin\s*$/.test(text)) problems.push('looks like it has a sign-off');
  return problems;
}

module.exports = { render, subject, guard, toText, CALENDLY, P3, CTA };
