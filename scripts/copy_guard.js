/**
 * Copy checks shared by the conference engine (conf_connect.js, conf_render.js).
 * Moved here from mo_render.js when the market outreach engine was removed on
 * 2026-09-25, so conferences keep the same last line of defence.
 */

/** Strip tags for a readable console preview. */
const toText = html => String(html || '')
  .replace(/<div><br><\/div>/g, '\n\n')
  .replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
  .replace(/<\/div>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();

/**
 * Last line of defence before a draft. The anchor company must never reach a
 * recipient, and Calvin treats an em dash as a dealbreaker.
 */
function guard(html, project) {
  const text = toText(html);
  const problems = [];
  const anchor = String((project && project.anchor_company) || '').trim();
  if (anchor.length >= 3 &&
      new RegExp('\\b' + anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) {
    problems.push('anchor company "' + anchor + '" appears in the body');
  }
  if (/--|—|–/.test(text)) problems.push('contains an em dash or --');
  if (/\[Company\]|\[First\]|\[industry\]/.test(text)) problems.push('unfilled template slot');
  // A slot filled with an empty string reads as a typo: the leftover double
  // space is the tell.
  if (/ {2,}/.test(text)) problems.push('double space, likely an empty [Company] or [First] substitution');
  if (/\bBest,\s*$|\bCalvin\s*$/.test(text)) problems.push('looks like it has a sign-off');
  return problems;
}

module.exports = { guard, toText };
