/**
 * Block 2 checker for Round 1 Email 1. Read-only.
 *
 *   node scripts/block2_check.js "<draft paragraph>"   rule check + last 5 Block 2s
 *   node scripts/block2_check.js --recent 10           just print the last N Block 2s
 *
 * Rules come from references/block2-spec.md. This catches the mechanical failures.
 * The judgment checks (swap test, homepage test) still need a human or the model.
 */
const { connect } = require('./db');

/** Opener HTML comes from Superhuman with classes, <br/> and &#39;, so convert it here. */
const toText = html => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const BANNED = [
  [/i spen[dt] most (of )?(my )?time/i, 'stock opener "I spend most of my time"'],
  [/spending a (lot|ton) of time/i, 'stock opener "spending a lot/ton of time"'],
  [/thematic (work|investors?)/i, '"thematic work / thematic investors"'],
  [/pattern we keep seeing/i, '"the pattern we keep seeing"'],
  [/the ones that stall/i, '"the ones that stall"'],
  [/is interesting though/i, '"is interesting though"'],
  [/what (i|we) (really )?like about/i, '"What I like about"'],
  [/one thing (i|we)('ve| have)? ?(noticed|seen|learned)|keep thinking about/i, '"one thing I\'ve noticed / keep thinking about"'],
  [/natural (path|way)/i, '"natural path/way"'],
  [/system of (record|action)|operating layer/i, 'platform / system-of-record claim'],
  [/rather than (just )?another|not just another|than another (tool|dashboard)/i, '"rather than just another X"'],
  [/huge opportunity|game ?changer|table stakes|the fact that|especially compelling/i, 'inflated phrase'],
  [/help (lead|drive) our|alongside my principal/i, 'credential lead-in'],
];

/**
 * Voice checks, added 2026-10-12. The model's own voice reaches for a clever closing line
 * ("shifts who keeps the margin", "keeps what it already paid to learn"). None of Calvin's
 * replied-to openers do that. They are plain, concrete and usually end on a specific question.
 */
const VOICE = [
  [/\b(margin|leverage|moat|flywheel|unlock(s|ed)?|tailwinds?|paradigm|intelligence layer|control plane)\b/i, 'abstract payoff noun'],
  [/\b(quietly|finally|fundamentally|essentially|ultimately|truly)\b/i, 'narrator adverb'],
  [/\bwho (keeps|owns|captures|wins)\b|\bshifts? (who|where|the)\b/i, 'clever "who keeps / shifts who" payoff'],
  [/\b(paid|pays) to (learn|know)\b|\bbuys? (it|that \w+) back\b/i, 'aphorism'],
  [/\b(isn't|is not) (the|really the) \w+,? (it's|it is)\b|\bdisguised as\b|\bwearing .{0,30} clothes\b/i, '"it\'s not X, it\'s Y" reframe (disguised-problem openers had the lowest Email 1 reply rate, 16%)'],
  [/\bnobody in the chain\b|\beveryone in the chain\b/i, 'abstract system narration'],
];

function voice(p) {
  const out = [];
  for (const [re, label] of VOICE) if (re.test(p)) out.push('voice: ' + label);
  const sentences = p.split(/(?<=[.?!])\s+/).filter(s => s.trim());
  const last = sentences[sentences.length - 1] || '';
  if (!/\?\s*$|\bcurious (whether|how|if|what|why|which)\b/i.test(last)) out.push('warn: no closing question (May and July openers with one got about 40% Email 1 replies vs 16 to 24% without)');
  return out;
}

/** Long shared phrases with the company's own site text means it fails the homepage test. */
function homepage(p, siteText) {
  const words = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const site = ' ' + words(siteText).join(' ') + ' ';
  const w = words(p), hits = new Set();
  for (let i = 0; i + 5 <= w.length; i++) {
    const g = w.slice(i, i + 5).join(' ');
    if (site.includes(' ' + g + ' ')) hits.add(g);
  }
  return [...hits].map(g => 'homepage: shares "' + g + '" with the company site');
}

function check(p) {
  const out = [];
  if (/—|–|--| - /.test(p)) out.push('dash (em, en, double hyphen or spaced hyphen)');
  if (/:/.test(p)) out.push('colon');
  if (/;/.test(p)) out.push('semicolon');
  const sentences = p.split(/(?<=[.?!])\s+/).filter(s => s.trim());
  if (sentences.length < 2 || sentences.length > 4) out.push(`${sentences.length} sentences (want 2 to 4)`);
  const words = p.split(/\s+/).filter(Boolean).length;
  if (words < 45 || words > 95) out.push(`${words} words (want 45 to 95)`);
  if (/\$\d|\d+%|\d+x\b|\braised\b|\bseed round\b/i.test(p)) out.push('metric or funding used in Block 2');
  for (const [re, label] of BANNED) if (re.test(p)) out.push('banned: ' + label);
  return out;
}

/** Block 2 is the paragraph after the Telescope intro and before the close. */
function block2(html) {
  const paras = toText(html).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const intro = paras.findIndex(s => /Series A fund|Mickey|Sequoia/i.test(s));
  const close = paras.findIndex(s => /^I'd love to chat/i.test(s));
  if (intro >= 0 && close > intro) return paras.slice(intro + 1, close).join('\n\n');
  return paras.length >= 3 ? paras.slice(1, -1).join('\n\n') : '';
}

async function recent(n) {
  const c = await connect();
  try {
    const r = await c.query(
      `select co.name, coalesce(st.sent_at, st.drafted_at)::date d, st.body_html
         from step st join sequence s on s.id = st.sequence_id join company co on co.id = s.company_id
        where st.step_no = 1 and s.kind = 'first' and st.body_html is not null
        order by coalesce(st.sent_at, st.drafted_at, s.created_at) desc nulls last limit $1`, [n * 2]);
    return r.rows.map(x => ({ name: x.name, d: x.d, b2: block2(x.body_html) })).filter(x => x.b2).slice(0, n);
  } finally { await c.end(); }
}

module.exports = { check, block2, voice, homepage, BANNED };

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--recent');
  const n = ri >= 0 ? parseInt(args[ri + 1] || '5', 10) : 5;
  const si = args.indexOf('--site');
  const sitePath = si >= 0 ? args[si + 1] : null;
  const skip = new Set();
  if (ri >= 0) { skip.add(ri); skip.add(ri + 1); }
  if (si >= 0) { skip.add(si); skip.add(si + 1); }
  const draft = args.filter((a, i) => !skip.has(i)).join(' ').trim();
  if (draft) {
    const p = check(draft);
    const v = voice(draft);
    const h = sitePath ? homepage(draft, require('fs').readFileSync(sitePath, 'utf8')) : [];
    const hard = [...p, ...v.filter(x => !x.startsWith('warn')), ...h];
    console.log(hard.length ? 'FAIL\n  ' + hard.join('\n  ') : 'PASS mechanical and voice checks');
    v.filter(x => x.startsWith('warn')).forEach(x => console.log('  ' + x));
    if (!sitePath) console.log('  note: pass --site <file with the company homepage text> to run the homepage test');
  }
  try {
    const rows = await recent(n);
    console.log(`\nLast ${rows.length} Block 2s. Reject the draft if it repeats an opener, rhythm, pivot or closing move.`);
    rows.forEach(r => console.log(`\n[${r.d ? r.d.toISOString().slice(0, 10) : '?'}] ${r.name}\n${r.b2}`));
  } catch (e) {
    console.log('\nCould not reach the database (' + e.message + '). Pull recent step 1 bodies through the Supabase MCP instead.');
  }
})();
