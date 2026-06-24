// Add June 2 follow-up entries for 24 companies (3 each = 72 total)
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'followups.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const companies = [
  {
    slug: 'zerodrift', company: 'ZeroDrift', founder: 'Kumesh', email: 'kumesh@zerodrift.ai',
    domain: 'zerodrift.ai', threadId: '19e8984272069ae0', messageId: '19e8984272069ae0',
    subject: 'congrats on the raise | Telescope intro',
    email3Pattern: 'A', portfolioCos: 'Persuit and Logikcull',
    email3Sentence: 'With all the AI tools hitting the enterprise, sounds like compliance teams are scrambling to keep up and real-time enforcement is going to be critical.',
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'nox_metals', company: 'Nox Metals', founder: 'Zane', email: 'zane@noxmetals.co',
    domain: 'noxmetals.co', threadId: '19e89825e99d8247', messageId: '19e89825e99d8247',
    subject: 'Nox Metals + Telescope',
    email3Pattern: 'A', portfolioCos: 'Parabola and Paperless Parts',
    email3Sentence: 'The model of combining software with direct manufacturing operations is one we keep seeing work across verticals.',
    email4Template: 'funded', round: 'YC seed'
  },
  {
    slug: 'prox', company: 'Prox', founder: 'Gregory', email: 'greg@useprox.com',
    domain: 'useprox.com', threadId: '19e898211b634709', messageId: '19e898211b634709',
    subject: 'Prox + Telescope',
    email3Pattern: 'A', portfolioCos: 'Parabola and Paperless Parts',
    email3Sentence: 'The knowledge drain problem in industrial verticals keeps coming up in our conversations, especially as senior specialists retire.',
    email4Template: 'funded', round: 'pre-seed'
  },
  {
    slug: 'kinth', company: 'Kinth', founder: 'Arhon', email: 'arhons@kinth.ai',
    domain: 'kinth.ai', threadId: '19e898164025cefc', messageId: '19e898164025cefc',
    subject: 'Kinth + Telescope',
    email3Pattern: 'C',
    email3Obs: "I've been reading more about CAD-native AI design tools and I think parametric geometry is where the market needs to go - curious how early customer conversations are going.",
    email4Template: 'nofunding'
  },
  {
    slug: 'nebula', company: 'Nebula', founder: 'Akshat', email: 'akshat@trynebula.ai',
    domain: 'trynebula.ai', threadId: '19e8981127019684', messageId: '19e8981127019684',
    subject: 'Telescope <> Nebula Intro',
    email3Pattern: 'C',
    email3Obs: "I've been thinking more about the agent memory problem and I think it's going to be one of the key infrastructure layers as production AI deployments scale - curious what you're seeing from early adopters.",
    email4Template: 'nofunding'
  },
  {
    slug: 'reviva', company: 'Reviva', founder: 'Valerie', email: 'valerie@joinreviva.com',
    domain: 'joinreviva.com', threadId: '19e897eb1af20820', messageId: '19e897eb1af20820',
    subject: 'Reviva + Telescope',
    email3Pattern: 'B', portfolioCos: 'MedTrainer and Carefeed',
    email3Sentence: 'The cash-pay wellness market keeps coming up as an underserved segment and I think the EHR opportunity there is massive.',
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'fireproof', company: 'Fireproof', founder: 'Nate', email: 'nate@fireprooftech.com',
    domain: 'fireprooftech.com', threadId: '19e897bea3679bc2', messageId: '19e897bea3679bc2',
    subject: 'Fireproof + Telescope',
    email3Pattern: 'C',
    email3Obs: "I've been digging more into vertical AI for public safety and I think fire departments are one of those verticals that's finally ready for modern software - curious how adoption conversations are going on your end.",
    email4Template: 'nofunding'
  },
  {
    slug: 'onetera', company: 'Onetera', founder: 'Felix', email: 'felix@onetera.com',
    domain: 'onetera.com', threadId: '19e897aed29f06b7', messageId: '19e897aed29f06b7',
    subject: 'Telescope <> Onetera Intro',
    email3Pattern: 'C',
    email3Obs: 'I saw the NVIDIA case study on your work with local governments and it reminded me of how much opportunity there is in this market, especially for AI that actually works within existing municipal workflows - curious how things are trending.',
    email4Template: 'nofunding'
  },
  {
    slug: 'continuum', company: 'Continuum', founder: 'Daniel', email: 'daniel@oncontinuum.com',
    domain: 'oncontinuum.com', threadId: '19e897a4dc9c48e4', messageId: '19e897a4dc9c48e4',
    subject: 'Continuum + Telescope',
    email3Pattern: 'B', portfolioCos: 'Fathom',
    email3Sentence: 'As an investor in Fathom, meeting intelligence is a space we follow closely and I think the on-device approach for financial advisors is a real differentiator.',
    email4Template: 'funded', round: 'pre-seed'
  },
  {
    slug: 'qued', company: 'Qued', founder: 'Prasad', email: 'prasad@qued.com',
    domain: 'qued.com', threadId: '19e897952f5d55b4', messageId: '19e897952f5d55b4',
    subject: 'Telescope <> Qued Intro',
    email3Pattern: 'A', portfolioCos: 'Project44 and Parabola',
    email3Sentence: 'The freight appointment scheduling problem keeps coming up in our logistics conversations and I think the McLeod integration is a huge unlock for adoption.',
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'paraglide', company: 'Paraglide', founder: 'Rasmus', email: 'rasmus@paraglide.ai',
    domain: 'paraglide.ai', threadId: '19e897863fd55f60', messageId: '19e897863fd55f60',
    subject: 'Paraglide + Telescope',
    email3Pattern: 'C',
    email3Obs: "I've been thinking more about the AR collections space and I think the shift from one-way reminders to actual two-way AI conversations is going to be a game changer - curious how customers are responding.",
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'zeit', company: 'Zeit', founder: 'Leopold', email: 'leopold@zeit-ai.com',
    domain: 'zeit-ai.com', threadId: '19e8977b01447a2b', messageId: '19e8977b01447a2b',
    subject: 'Zeit + Telescope',
    email3Pattern: 'A', portfolioCos: 'Datadog',
    email3Sentence: 'The enterprise BI space keeps coming up in our conversations and I think the self-serve approach is where the market is heading.',
    email4Template: 'funded', round: 'YC seed'
  },
  {
    slug: 'olympian', company: 'Olympian', founder: 'Brendan', email: 'brendan@getolympian.co',
    domain: 'getolympian.co', threadId: '19e89769ecc2d869', messageId: '19e89769ecc2d869',
    subject: 'Telescope <> Olympian',
    email3Pattern: 'A', portfolioCos: 'ShopGenie and PartsTech',
    email3Sentence: 'AI voice agents for the trades keeps coming up as a hot topic and I think the remodeling vertical is a great wedge.',
    email4Template: 'nofunding'
  },
  {
    slug: 'tero', company: 'Tero', founder: 'Ben', email: 'ben@usetero.com',
    domain: 'usetero.com', threadId: '19e8976066e15661', messageId: '19e8976066e15661',
    subject: 'Telescope <> Tero Intro',
    email3Pattern: 'A', portfolioCos: 'Datadog',
    email3Sentence: 'The observability cost problem keeps coming up in our conversations and I think attacking it at the application code level instead of the infrastructure level is the right approach.',
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'blue_pill', company: 'BluePill', founder: 'Ankit', email: 'ad@blue-pill.ai',
    domain: 'blue-pill.ai', threadId: '19e89746592d8f8b', messageId: '19e89746592d8f8b',
    subject: 'Blue Pill + Telescope',
    email3Pattern: 'C',
    email3Obs: "I've been reading more about synthetic consumer research and I think the accuracy benchmarks are getting to the point where it could genuinely replace traditional panels for a lot of use cases - curious how brand conversations are going.",
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'thirdlaw', company: 'ThirdLaw', founder: 'Ed', email: 'ed@thirdlaw.io',
    domain: 'thirdlaw.io', threadId: '19e8973d6450046c', messageId: '19e8973d6450046c',
    subject: 'Telescope <> Thirdlaw',
    email3Pattern: 'A', portfolioCos: 'Axonius and JumpCloud',
    email3Sentence: 'AI governance is becoming a bigger priority for every enterprise security team we talk to and I think the real-time enforcement approach is going to win out.',
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'ferry', company: 'Ferry', founder: 'Ethan', email: 'ethan@deployferry.io',
    domain: 'deployferry.io', threadId: '19e8972cb791998c', messageId: '19e8972cb791998c',
    subject: 'Telescope <> Ferry Intro',
    email3Pattern: 'A', portfolioCos: 'Parabola and Paperless Parts',
    email3Sentence: 'The forward-deployed AI model for manufacturing keeps coming up in our conversations and I think the MES layer is a huge opportunity.',
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'pensar', company: 'Pensar', founder: 'Kyle', email: 'kyle@pensarai.com',
    domain: 'pensarai.com', threadId: '19e897259903516b', messageId: '19e897259903516b',
    subject: 'Pensar + Telescope',
    email3Pattern: 'A', portfolioCos: 'Axonius and JumpCloud',
    email3Sentence: 'Continuous adversarial testing keeps coming up as a need in our security conversations and I think the shift from point-in-time pentests is inevitable.',
    email4Template: 'funded', round: 'pre-seed'
  },
  {
    slug: 'frugal', company: 'Frugal', founder: 'Mike', email: 'mike@frugal.co',
    domain: 'frugal.co', threadId: '19e8971b871d14d5', messageId: '19e8971b871d14d5',
    subject: 'Telescope <> Frugal Connect',
    email3Pattern: 'C',
    email3Obs: "I've been thinking more about the cloud cost engineering space and I think attacking waste at the application code level is going to prove to be a much bigger lever than infrastructure rightsizing - curious how customer conversations are trending.",
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'sammy_labs', company: 'SAMMY Labs', founder: 'Joe', email: 'joe@sammylabs.com',
    domain: 'sammylabs.com', threadId: '19e8971243dda35b', messageId: '19e8971243dda35b',
    subject: 'SAMMY Labs + Telescope',
    email3Pattern: 'C',
    email3Obs: "I've been thinking more about the documentation automation space and I think screen-aware AI that learns the product directly is the right approach - curious what verticals are showing the most traction.",
    email4Template: 'funded', round: 'pre-seed'
  },
  {
    slug: 'trace', company: 'Trace', founder: 'Tim', email: 'tim@trace.so',
    domain: 'trace.so', threadId: '19e897040221c5f2', messageId: '19e897040221c5f2',
    subject: 'Trace + Telescope',
    email3Pattern: 'C',
    email3Obs: "I've been thinking more about AI workflow orchestration and I think the human-in-the-loop handoff problem is going to be one of the defining challenges for ops teams this year - curious how adoption is trending.",
    email4Template: 'funded', round: 'seed'
  },
  {
    slug: 'archie', company: 'Archie', founder: 'Stuart', email: 'stuart@heyarchie.ai',
    domain: 'heyarchie.ai', threadId: '19e896c54fdedeb4', messageId: '19e896c54fdedeb4',
    subject: 'AI accounting | Telescope intro',
    email3Pattern: 'C',
    email3Obs: "I've been digging more into AI for accounting firms and I think the shift from workflow tools to actual AI staff is going to be a massive category - curious how firm conversations are going.",
    email4Template: 'nofunding'
  },
  {
    slug: 'zalion', company: 'Zalion', founder: 'Tim', email: 'tim.geyer@zalion.ai',
    domain: 'zalion.ai', threadId: '19e896bd9ecf78e0', messageId: '19e896bd9ecf78e0',
    subject: 'Telescope <> Zalion',
    email3Pattern: 'A', portfolioCos: 'Parabola and Paperless Parts',
    email3Sentence: 'The procurement automation problem in manufacturing keeps coming up in our conversations and I think the enterprise traction you have in Europe is impressive.',
    email4Template: 'nofunding'
  },
  {
    slug: 'tofu', company: 'Tofu', founder: 'Jason', email: 'jason@hiretofu.com',
    domain: 'hiretofu.com', threadId: '19e896b55ab3f8ba', messageId: '19e896b55ab3f8ba',
    subject: 'Telescope <> Tofu Intro',
    email3Pattern: 'A', portfolioCos: 'JumpCloud',
    email3Sentence: 'The candidate fraud problem keeps coming up in our conversations and I think it is only going to get worse as deepfake technology improves.',
    email4Template: 'funded', round: 'seed'
  }
];

function buildEmail2(c) {
  return '<div>Hey ' + c.founder + ', Just wanted to check in here and see if you had time in the next week or two to connect. I\'d love to learn more about what you\'re building and see how Telescope can be helpful.</div>';
}

function buildEmail3(c) {
  if (c.email3Pattern === 'A') {
    return '<div>Hey ' + c.founder + ' - Hope all is well! Thought I\'d shoot you a note as I was chatting with Chris Gaertner on our team who has invested in ' + c.portfolioCos + ' and the conversation made me think about what you\'re building at ' + c.company + '. ' + c.email3Sentence + ' Even if we aren\'t on the cap table, we\'re always chatting with folks in the market (including potential customers) and I\'m happy to try to make intros/swap notes on what we\'ve heard. Is there a good time next week?</div>';
  } else if (c.email3Pattern === 'B') {
    return '<div>Hey ' + c.founder + ' - Hope all is well! Thought I\'d shoot you a note as I was chatting with one of our portfolio company leaders at ' + c.portfolioCos + ' and the conversation made me think about what you\'re building. ' + c.email3Sentence + ' Even if we aren\'t on the cap table, we\'re always chatting with folks in the market (including potential customers) and I\'m happy to try to make intros/swap notes on what we\'ve heard. Is there a good time next week?</div>';
  } else {
    return '<div>Hey ' + c.founder + ' - Hope all is well! I know it\'s been a minute but wanted to check in. ' + c.email3Obs + ' Would love to hear more about the vision for ' + c.company + ' and find ways to help (whether or not we\'re on the cap table). How does your schedule look later this week or next?</div>';
  }
}

function buildEmail4(c) {
  if (c.email4Template === 'funded') {
    return '<div>Hey ' + c.founder + ', Following up - have you thought about another partner after your ' + c.round + '? I really like what you\'re building at ' + c.company + ' and would love to develop a relationship ahead of any future fundraise. We like getting to know founders and developing the relationship to make sure it\'s a good fit for both parties. However, LMK if I\'m off the mark here - would love to get your thoughts regardless.</div>';
  } else {
    return '<div>' + c.founder + ' - hope you\'re doing well. Last note from me - totally understand if now is not the right time. As you think about a partner though - we\'d love to be a part of that discussion and get to know you ahead of time. LMK if there\'s a good time to reach back out to start these discussions.</div>';
  }
}

const newEntries = [];
for (const c of companies) {
  newEntries.push({
    slug: c.slug, company: c.company, founder: c.founder, email: c.email,
    domain: c.domain, threadId: c.threadId, messageId: c.messageId,
    subject: c.subject, body: buildEmail2(c), emailNumber: 2,
    sendDate: '2026-06-04', status: 'pending'
  });
  newEntries.push({
    slug: c.slug, company: c.company, founder: c.founder, email: c.email,
    domain: c.domain, threadId: c.threadId, messageId: c.messageId,
    subject: c.subject, body: buildEmail3(c), emailNumber: 3,
    sendDate: '2026-06-07', status: 'pending'
  });
  newEntries.push({
    slug: c.slug, company: c.company, founder: c.founder, email: c.email,
    domain: c.domain, threadId: c.threadId, messageId: c.messageId,
    subject: c.subject, body: buildEmail4(c), emailNumber: 4,
    sendDate: '2026-06-09', status: 'pending'
  });
}

data.pending = data.pending.concat(newEntries);

// Write with LF line endings only (no CRLF)
const output = JSON.stringify(data, null, 2).replace(/\r\n/g, '\n');
fs.writeFileSync(dataPath, output, 'utf8');

console.log('Done. Total entries:', data.pending.length);
console.log('New entries added:', newEntries.length);
console.log('\nSample Email 2 (ZeroDrift):');
console.log(JSON.stringify(newEntries[0], null, 2));
console.log('\nSample Email 3 (ZeroDrift):');
console.log(JSON.stringify(newEntries[1], null, 2));
console.log('\nSample Email 4 (ZeroDrift):');
console.log(JSON.stringify(newEntries[2], null, 2));
