/**
 * Pull the openers founders actually replied to, closest to the company being drafted.
 * Read-only. Source: references/opener-corpus.jsonl (verbatim Block 2s from Gmail, May 18 on).
 *
 *   node scripts/winners.js --market "erp maintenance" --about "<what_they_do from the brief>"
 *   node scripts/winners.js --market "..." --n 6 --contrast 2
 *   node scripts/winners.js ... --exclude <domain>   leave out the company itself (re-drafts, tests)
 *
 * Prints N winners (engaged_block2 first, then positive_meeting, replies to Email 1 preferred),
 * verbatim, plus a few same-market openers that got no reply, as the contrast set.
 * Draft by imitating the winners' sentences, not the spec's summary of them.
 */
const fs = require('fs');
let BANNED = [];
try { BANNED = require('./block2_check').BANNED || []; } catch (e) { /* checker optional */ }
const stems = t => BANNED.filter(([re]) => re.test(t)).map(([, l]) => l);
const path = require('path');

const FILE = path.join(__dirname, '..', 'references', 'opener-corpus.jsonl');
const STOP = new Set(('a an the and or of for to in on at by with from that this is are be it its as into ' +
  'their they them your you our we i but not so than then when what which who how why can will just more most ' +
  'company companies team teams software platform ai tools tool').split(' '));
const toks = s => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };

function load() {
  return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function rank(rows, market, about) {
  const m = toks(market), a = toks(about);
  return rows.map(r => {
    const rm = toks(r.market), rb = toks(r.block2);
    return { r, score: 3 * overlap(m, rm) + overlap(m, rb) + 0.5 * overlap(a, rb) + overlap(a, rm) };
  }).sort((x, y) => y.score - x.score);
}

function pick({ market = '', about = '', n = 5, contrast = 2, exclude = '' } = {}) {
  const bare = d => String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const ex = bare(exclude), exName = ex.split('.')[0];
  const rows = load().filter(r => !r.recent && !(ex && (bare(r.domain) === ex ||
    String(r.company || '').toLowerCase().replace(/[^a-z0-9]/g, '') === exName.replace(/[^a-z0-9]/g, ''))));
  const tier = r => r.reply_class === 'engaged_block2' ? 2 : r.reply_class === 'positive_meeting' ? 1 : 0;
  const ranked = rank(rows, market, about);
  const wins = ranked.filter(x => tier(x.r) > 0)
    .map(x => ({ ...x, adj: x.score + 2 * tier(x.r) + (x.r.replied_to_email === 1 ? 1 : 0) - (stems(x.r.block2).length ? 1.5 : 0) }))
    .sort((x, y) => y.adj - x.adj)
    .slice(0, n).map(x => x.r);
  const losers = ranked.filter(x => x.r.reply_class === 'none').slice(0, contrast).map(x => x.r);
  return { wins, losers };
}

module.exports = { load, pick };

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : undefined; };
  const { wins, losers } = pick({ market: arg('market'), about: arg('about'),
    n: Number(arg('n') || 5), contrast: Number(arg('contrast') || 2), exclude: arg('exclude') });
  console.log(`WINNERS (${wins.length}). Imitate these. Same sentence length, same plainness, same kind of closing.\n`);
  for (const w of wins) {
    console.log(`[${w.reply_class}${w.replied_to_email === 1 ? '' : ', replied to email ' + w.replied_to_email}] ${w.company} (${w.market}, ${w.angle})`);
    console.log(w.block2.trim());
    const st = stems(w.block2);
    if (st.length) console.log(`  ! uses now-banned stems (copy the shape, not these): ${st.join('; ')}`);
    if (w.quoted_line) console.log(`  > founder reacted to: "${w.quoted_line}"`);
    if (w.reply_excerpt) console.log(`  > reply: ${w.reply_excerpt.replace(/\s+/g, ' ').slice(0, 220)}`);
    console.log('');
  }
  if (losers.length) {
    console.log(`NO REPLY, same market (${losers.length}). Do not write like these.\n`);
    for (const l of losers) console.log(`[none] ${l.company} (${l.market}, ${l.angle})\n${l.block2.trim()}\n`);
  }
}
