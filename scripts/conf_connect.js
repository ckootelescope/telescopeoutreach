/**
 * Conference connect: LinkedIn profile in, Superhuman drafts out.
 *
 * Separate from Round 1/2, market outreach and the company-list conference
 * sequence (conf_render.js). Nothing here touches Supabase. State is the `log`
 * array in conferences/connect-<slug>.json, which exists only to stop the same
 * person being drafted twice.
 *
 *   node scripts/conf_connect.js plan <people.json> [--slug=itc-vegas-2026]
 *   node scripts/conf_connect.js record <results.json> [--slug=itc-vegas-2026]
 *
 * people.json is an array of trimmed Apollo matches:
 *   [{ "linkedin": "...", "full_name": "...", "first": "...", "title": "...",
 *      "company": "...", "org_domain": "...", "email": "...", "email_status": "verified",
 *      "match_confidence": "high", "email_ok": "<why a domain mismatch is fine>", "hold": "<why not to draft>" }]
 *
 * plan prints the drafts to create. record appends what was actually drafted.
 */
const fs = require('fs');
const path = require('path');
const { guard } = require('./copy_guard');

const args = process.argv.slice(2);
const cmd = args[0];
const file = args[1];
const slug = (args.find(a => a.startsWith('--slug=')) || '--slug=itc-vegas-2026').split('=')[1];
const cfgPath = path.join(__dirname, '..', 'conferences', 'connect-' + slug + '.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const normLi = u => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').split('?')[0];
const fill = (s, p) => s.replace(/\{first\}/g, p.first).replace(/\{company\}/g, p.company);
const html = paras => paras.map(t => '<div>' + t + '</div>').join('<div><br></div>');

// Same bar as market outreach: a guessed address sent cold is worse than an InMail.
function gate(p) {
  // A human decision outranks the checks, e.g. a verified address on a sister
  // domain (pnptc.com for Plug and Play) that the domain match cannot know about.
  if (p.email && p.email_ok) return { route: 'email', reason: 'verified, domain approved: ' + p.email_ok };
  if (/^(low|none)$/i.test(String(p.match_confidence || ''))) return { route: 'salesnav', reason: 'Apollo match_confidence=' + p.match_confidence };
  const email = String(p.email || '').toLowerCase();
  if (!email) return { route: 'salesnav', reason: 'no email from Apollo' };
  if (String(p.email_status || '').toLowerCase() !== 'verified') return { route: 'salesnav', reason: 'email_status=' + (p.email_status || 'unknown') };
  const eDom = email.split('@')[1];
  const oDom = String(p.org_domain || '').toLowerCase().replace(/^www\./, '');
  if (oDom && eDom !== oDom && !eDom.endsWith('.' + oDom) && !oDom.endsWith('.' + eDom)) {
    return { route: 'salesnav', reason: 'email domain ' + eDom + ' != employer ' + oDom };
  }
  return { route: 'email', reason: 'verified' };
}

// People already emailed through the company-list ITC sequence.
function companySequenceEmails() {
  const f = path.join(__dirname, '..', 'conferences', slug + '.json');
  if (!fs.existsSync(f)) return new Set();
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  return new Set((j.contacts || []).map(c => String(c.email || '').toLowerCase()).filter(Boolean));
}

if (cmd === 'plan') {
  const people = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seen = new Set(cfg.log.map(l => normLi(l.linkedin)));
  const inSeq = companySequenceEmails();
  const out = [];
  for (const p of people) {
    const row = { linkedin: p.linkedin, name: p.full_name, title: p.title || '', company: p.company || '' };
    if (p.hold) { out.push({ ...row, skip: 'held: ' + p.hold }); continue; }
    if (seen.has(normLi(p.linkedin))) { out.push({ ...row, skip: 'already drafted (in log)' }); continue; }
    if (!p.first || !p.company) { out.push({ ...row, skip: 'missing first name or company, fill by hand' }); continue; }
    if (p.email && inSeq.has(p.email.toLowerCase())) { out.push({ ...row, skip: 'already in the company-list ITC sequence' }); continue; }
    const g = gate(p);
    const emailHtml = html(cfg.email.map(t => fill(t, p)));
    const drafts = [];
    if (g.route === 'email') {
      drafts.push({ kind: 'email', to: [p.email.toLowerCase()], subject: cfg.subject, body: emailHtml });
      drafts.push({ kind: 'linkedin', subject: 'LinkedIn: ' + p.full_name + ' | ' + p.linkedin, body: html([fill(cfg.linkedin_after_email, p)]) });
    } else {
      drafts.push({ kind: 'salesnav', subject: 'SalesNav: ' + p.full_name + ' | ' + p.linkedin, body: html(['Subject: ' + cfg.subject]) + '<div><br></div>' + emailHtml });
    }
    const problems = drafts.flatMap(d => guard(d.body, {}).map(x => d.kind + ': ' + x));
    out.push({ ...row, email: p.email || null, route: g.route, reason: g.reason, problems, drafts });
  }
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === 'record') {
  const results = JSON.parse(fs.readFileSync(file, 'utf8'));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  for (const r of results) cfg.log.push({ drafted_on: today, ...r });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log('logged ' + results.length + ', total ' + cfg.log.length);
} else {
  console.error('usage: conf_connect.js plan|record <file.json> [--slug=...]');
  process.exit(1);
}
