const https = require('https');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
}

const REPO = 'ckootelescope/telescopeoutreach';
const GH_PAT = process.env.GH_PAT;

function ghApi(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: '/repos/' + REPO + apiPath,
      method,
      headers: {
        'Authorization': 'Bearer ' + GH_PAT,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'telescopeoutreach'
      }
    };
    if (body) opts.headers['Content-Type'] = 'application/json';
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(res.statusCode + ': ' + d));
        else resolve(JSON.parse(d));
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const newEntries = [
  // ===================== ATOMIC INSIGHTS =====================
  {
    slug: 'atomic-insights',
    company: 'Atomic Insights',
    founder: 'Lucas',
    email: 'lucas.babbitt@atomicinsights.io',
    domain: 'atomicinsights.io',
    threadId: '19ed2e8120e7f824',
    messageId: '<19ed2e8120e7f824@mail.gmail.com>',
    subject: 'Telescope <> Atomic Insights Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Lucas,<br><br>One thing I keep thinking about in the wealth management space is how the custody transition wave has created a window where RIAs are more open to changing their back-office stack than they have been in years. I think that window doesn\'t stay open forever, and the companies that get in now will have a real advantage. Would love to hear if that\'s been a tailwind for you guys.<br><br>Happy to chat whenever makes sense.</div>'
  },
  {
    slug: 'atomic-insights',
    company: 'Atomic Insights',
    founder: 'Lucas',
    email: 'lucas.babbitt@atomicinsights.io',
    domain: 'atomicinsights.io',
    threadId: '19ed2e8120e7f824',
    messageId: '<19ed2e8120e7f824@mail.gmail.com>',
    subject: 'Telescope <> Atomic Insights Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Lucas,<br><br>For what it\'s worth, Chris on our team has spent a lot of time around fintech infrastructure and would love to compare notes on the space. Happy to set up a quick intro if you\'re open to it.</div>'
  },
  {
    slug: 'atomic-insights',
    company: 'Atomic Insights',
    founder: 'Lucas',
    email: 'lucas.babbitt@atomicinsights.io',
    domain: 'atomicinsights.io',
    threadId: '19ed2e8120e7f824',
    messageId: '<19ed2e8120e7f824@mail.gmail.com>',
    subject: 'Telescope <> Atomic Insights Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Lucas,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Would love to stay connected for whenever it makes sense.</div>'
  },

  // ===================== SAPIEN =====================
  {
    slug: 'sapien',
    company: 'Sapien',
    founder: 'Tony',
    email: 'tony@sapien.ai',
    domain: 'sapien.ai',
    threadId: '19ed2e7f27c1fe37',
    messageId: '<19ed2e7f27c1fe37@mail.gmail.com>',
    subject: 'Telescope <> Sapien Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Tony,<br><br>Was thinking more about the finance automation space. One thing I keep coming back to is how much time gets wasted on data validation alone before anyone even starts the actual analysis. I think the companies that figure out how to make finance teams trust the AI output enough to skip the manual sanity checks will pull away from the pack. Would love to hear how you guys are approaching that trust layer.</div>'
  },
  {
    slug: 'sapien',
    company: 'Sapien',
    founder: 'Tony',
    email: 'tony@sapien.ai',
    domain: 'sapien.ai',
    threadId: '19ed2e7f27c1fe37',
    messageId: '<19ed2e7f27c1fe37@mail.gmail.com>',
    subject: 'Telescope <> Sapien Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Tony,<br><br>Chris on our team was early to Fathom and has seen firsthand how AI wedges tend to expand once the initial workflow is nailed. Happy to connect you two if useful.</div>'
  },
  {
    slug: 'sapien',
    company: 'Sapien',
    founder: 'Tony',
    email: 'tony@sapien.ai',
    domain: 'sapien.ai',
    threadId: '19ed2e7f27c1fe37',
    messageId: '<19ed2e7f27c1fe37@mail.gmail.com>',
    subject: 'Telescope <> Sapien Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Tony,<br><br>Just bumping this. If the timing isn\'t right, no worries at all. Would love to stay in touch for whenever it makes sense.</div>'
  },

  // ===================== HALADIR =====================
  {
    slug: 'haladir',
    company: 'Haladir',
    founder: 'Jibran',
    email: 'jibran@haladir.com',
    domain: 'haladir.com',
    threadId: '19ed2e7e3e88d401',
    messageId: '<19ed2e7e3e88d401@mail.gmail.com>',
    subject: 'Telescope <> Haladir Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Jibran,<br><br>One thing I keep coming back to in supply chain is how much communication still relies on unstructured data. Quotes coming in as PDFs, confirmations over email, rate sheets in a different format from every carrier. I think the companies that can parse all of that and turn it into something actionable are going to be really well positioned. Would love to hear how you\'re approaching that data challenge.</div>'
  },
  {
    slug: 'haladir',
    company: 'Haladir',
    founder: 'Jibran',
    email: 'jibran@haladir.com',
    domain: 'haladir.com',
    threadId: '19ed2e7e3e88d401',
    messageId: '<19ed2e7e3e88d401@mail.gmail.com>',
    subject: 'Telescope <> Haladir Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Jibran,<br><br>Chris on our team worked closely with Project44 and Parabola as they scaled and would be happy to share what he\'s seen from the supply chain software side. Happy to set up a quick intro if useful.</div>'
  },
  {
    slug: 'haladir',
    company: 'Haladir',
    founder: 'Jibran',
    email: 'jibran@haladir.com',
    domain: 'haladir.com',
    threadId: '19ed2e7e3e88d401',
    messageId: '<19ed2e7e3e88d401@mail.gmail.com>',
    subject: 'Telescope <> Haladir Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Jibran,<br><br>Bumping this one more time. If now isn\'t the right time, totally understand. Would love to connect whenever makes sense.</div>'
  },

  // ===================== CHRT =====================
  {
    slug: 'chrt',
    company: 'chrt',
    founder: 'Kyle',
    email: 'kyle@chrt.com',
    domain: 'chrt.com',
    threadId: '19ed2e7c0b6ebcb9',
    messageId: '<19ed2e7c0b6ebcb9@mail.gmail.com>',
    subject: 'Telescope <> chrt Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Kyle,<br><br>Was thinking more about the time-sensitive freight space. One thing that stands out is how much worse the tracking and visibility tends to be on these loads compared to standard freight, mostly because the carrier networks are smaller and less digitized. I\'d be curious whether the data and visibility angle is a core part of the value prop or if it\'s more about the matching and pricing side.</div>'
  },
  {
    slug: 'chrt',
    company: 'chrt',
    founder: 'Kyle',
    email: 'kyle@chrt.com',
    domain: 'chrt.com',
    threadId: '19ed2e7c0b6ebcb9',
    messageId: '<19ed2e7c0b6ebcb9@mail.gmail.com>',
    subject: 'Telescope <> chrt Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Kyle,<br><br>Chris on our team was early to Project44 and Parabola and has a good feel for what works in logistics software. Happy to connect you two if you\'re open to it.</div>'
  },
  {
    slug: 'chrt',
    company: 'chrt',
    founder: 'Kyle',
    email: 'kyle@chrt.com',
    domain: 'chrt.com',
    threadId: '19ed2e7c0b6ebcb9',
    messageId: '<19ed2e7c0b6ebcb9@mail.gmail.com>',
    subject: 'Telescope <> chrt Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Kyle,<br><br>Bumping this one last time. If the timing doesn\'t work, totally understand. Would love to stay connected.</div>'
  },

  // ===================== SIGNAL LIFT =====================
  {
    slug: 'signal-lift',
    company: 'Signal Lift',
    founder: 'Jason',
    email: 'jason@signallift.com',
    domain: 'signallift.com',
    threadId: '19ed2e798e949a35',
    messageId: '<19ed2e798e949a35@mail.gmail.com>',
    subject: 'Telescope <> Signal Lift Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Jason,<br><br>One thing I keep thinking about with multi-unit retail is how much untapped data sits in POS systems that never gets used for actual decisions. Most chains pull basic sales reports, but I think the real unlock is connecting that to local market dynamics in a way that individual store managers can actually act on. Would love to hear how that feedback loop works in practice with your customers.</div>'
  },
  {
    slug: 'signal-lift',
    company: 'Signal Lift',
    founder: 'Jason',
    email: 'jason@signallift.com',
    domain: 'signallift.com',
    threadId: '19ed2e798e949a35',
    messageId: '<19ed2e798e949a35@mail.gmail.com>',
    subject: 'Telescope <> Signal Lift Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Jason,<br><br>We\'ve seen firsthand with portfolio companies like Postscript how powerful it is when brands can act on their own data in ways they couldn\'t before. I think you\'re solving the same problem for brick-and-mortar. Happy to make intros if useful.</div>'
  },
  {
    slug: 'signal-lift',
    company: 'Signal Lift',
    founder: 'Jason',
    email: 'jason@signallift.com',
    domain: 'signallift.com',
    threadId: '19ed2e798e949a35',
    messageId: '<19ed2e798e949a35@mail.gmail.com>',
    subject: 'Telescope <> Signal Lift Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Jason,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Happy to reconnect whenever it makes sense.</div>'
  },

  // ===================== ARKERO =====================
  {
    slug: 'arkero',
    company: 'Arkero',
    founder: 'Daniel',
    email: 'daniel@arkero.ai',
    domain: 'arkero.ai',
    threadId: '19ed2e645a2786ff',
    messageId: '<19ed2e645a2786ff@mail.gmail.com>',
    subject: 'fellow CMC grad | Telescope intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Daniel,<br><br>Been thinking more about the sports tech space and one thing that excites me is how much clubs are starting to treat their digital presence like a product rather than an afterthought. I think the teams that figure out how to monetize fan engagement beyond ticket sales and merch have a real edge, especially at the MLS and USL level where every dollar matters more. Would love to hear how you\'re seeing that play out.</div>'
  },
  {
    slug: 'arkero',
    company: 'Arkero',
    founder: 'Daniel',
    email: 'daniel@arkero.ai',
    domain: 'arkero.ai',
    threadId: '19ed2e645a2786ff',
    messageId: '<19ed2e645a2786ff@mail.gmail.com>',
    subject: 'fellow CMC grad | Telescope intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Daniel,<br><br>As mentioned, we\'re investors in Gipper and have seen firsthand how much traction there is in helping sports organizations level up their content and operations. Would be great to compare notes as a fellow Stag.</div>'
  },
  {
    slug: 'arkero',
    company: 'Arkero',
    founder: 'Daniel',
    email: 'daniel@arkero.ai',
    domain: 'arkero.ai',
    threadId: '19ed2e645a2786ff',
    messageId: '<19ed2e645a2786ff@mail.gmail.com>',
    subject: 'fellow CMC grad | Telescope intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Daniel,<br><br>Bumping this one more time. If the timing isn\'t right, totally understand. Would be great to grab coffee or jump on a call whenever works.</div>'
  },

  // ===================== BRICK DYNAMICS =====================
  {
    slug: 'brick-dynamics',
    company: 'Brick Dynamics',
    founder: 'Tom',
    email: 'tom@brickdynamics.com',
    domain: 'brickdynamics.com',
    threadId: '19ed2e068236e4d0',
    messageId: '<19ed2e068236e4d0@mail.gmail.com>',
    subject: 'Telescope <> Brick Dynamics Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Tom,<br><br>One thing I keep coming back to with multi-location businesses is how much knowledge gets siloed at individual locations. The GM at one store figures out something that works, but that insight never makes it to the other 50. I think whoever solves that knowledge transfer problem at scale will own the category. Would love to hear how you\'re thinking about that.</div>'
  },
  {
    slug: 'brick-dynamics',
    company: 'Brick Dynamics',
    founder: 'Tom',
    email: 'tom@brickdynamics.com',
    domain: 'brickdynamics.com',
    threadId: '19ed2e068236e4d0',
    messageId: '<19ed2e068236e4d0@mail.gmail.com>',
    subject: 'Telescope <> Brick Dynamics Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Tom,<br><br>Chris on our team has spent a lot of time around vertical SaaS companies like ShopGenie and Mangomint that serve multi-location businesses. Happy to connect you two if useful.</div>'
  },
  {
    slug: 'brick-dynamics',
    company: 'Brick Dynamics',
    founder: 'Tom',
    email: 'tom@brickdynamics.com',
    domain: 'brickdynamics.com',
    threadId: '19ed2e068236e4d0',
    messageId: '<19ed2e068236e4d0@mail.gmail.com>',
    subject: 'Telescope <> Brick Dynamics Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Tom,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Would love to stay in touch.</div>'
  },

  // ===================== AI LEAN =====================
  {
    slug: 'ai-lean',
    company: 'Ai Lean',
    founder: 'Luke',
    email: 'luke@ai-lean.com',
    domain: 'ai-lean.com',
    threadId: '19ed2deba8aeecb0',
    messageId: '<19ed2deba8aeecb0@mail.gmail.com>',
    subject: 'Telescope <> Ai Lean Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Luke,<br><br>One thing I keep thinking about in self-storage is how fragmented the compliance requirements are across states. Every state has different lien laws, different notice periods, different rules on auctions. I think that fragmentation is actually a competitive advantage for you since it makes it really hard for operators to handle in-house as they expand into new geographies. Would love to hear how much of the growth is coming from multi-state operators vs. single-market players.</div>'
  },
  {
    slug: 'ai-lean',
    company: 'Ai Lean',
    founder: 'Luke',
    email: 'luke@ai-lean.com',
    domain: 'ai-lean.com',
    threadId: '19ed2deba8aeecb0',
    messageId: '<19ed2deba8aeecb0@mail.gmail.com>',
    subject: 'Telescope <> Ai Lean Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Luke,<br><br>Chris on our team invested in companies like Logikcull and Persuit in the legal and compliance space and has a good perspective on how compliance automation scales. Happy to connect you two if helpful.</div>'
  },
  {
    slug: 'ai-lean',
    company: 'Ai Lean',
    founder: 'Luke',
    email: 'luke@ai-lean.com',
    domain: 'ai-lean.com',
    threadId: '19ed2deba8aeecb0',
    messageId: '<19ed2deba8aeecb0@mail.gmail.com>',
    subject: 'Telescope <> Ai Lean Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Luke,<br><br>Bumping this one last time. If the timing isn\'t right, totally understand. Would love to stay connected.</div>'
  },

  // ===================== RAYVN =====================
  {
    slug: 'rayvn',
    company: 'RAYVN',
    founder: 'Oyvind',
    email: 'oyvind.reed@rayvn.global',
    domain: 'rayvn.global',
    threadId: '19ed2de91cb96558',
    messageId: '<19ed2de91cb96558@mail.gmail.com>',
    subject: 'Telescope <> RAYVN Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Oyvind,<br><br>Was thinking more about the emergency response space. One thing that stands out is how regulation is starting to push organizations toward more structured crisis management, both in Europe with the CER Directive and in the US with OSHA and FEMA requirements. I think that regulatory tailwind is going to accelerate adoption quickly for companies that already have the platform in place. Would love to hear if you\'re seeing that play out.</div>'
  },
  {
    slug: 'rayvn',
    company: 'RAYVN',
    founder: 'Oyvind',
    email: 'oyvind.reed@rayvn.global',
    domain: 'rayvn.global',
    threadId: '19ed2de91cb96558',
    messageId: '<19ed2de91cb96558@mail.gmail.com>',
    subject: 'Telescope <> RAYVN Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Oyvind,<br><br>For what it\'s worth, we\'ve helped several European companies think through their US expansion strategy and would be happy to share what we\'ve seen work. The buyer dynamics are different here but the opportunity is massive.</div>'
  },
  {
    slug: 'rayvn',
    company: 'RAYVN',
    founder: 'Oyvind',
    email: 'oyvind.reed@rayvn.global',
    domain: 'rayvn.global',
    threadId: '19ed2de91cb96558',
    messageId: '<19ed2de91cb96558@mail.gmail.com>',
    subject: 'Telescope <> RAYVN Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Oyvind,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Would love to stay connected and learn more about the expansion plans.</div>'
  },

  // ===================== GOODDAY =====================
  {
    slug: 'goodday',
    company: 'GoodDay',
    founder: 'Kyle',
    email: 'kyle@gooddaysoftware.com',
    domain: 'gooddaysoftware.com',
    threadId: '19ed2de6c6448fde',
    messageId: '<19ed2de6c6448fde@mail.gmail.com>',
    subject: 'Telescope <> GoodDay Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Kyle,<br><br>One thing I keep seeing in the Shopify ecosystem is brands hitting a wall around $5-10M in revenue where they\'ve outgrown their Shopify app stack but aren\'t big enough for NetSuite. I think that gap is where the real opportunity is, since those brands need ERP-level functionality without the implementation headache. Would love to hear where the sweet spot is for GoodDay.</div>'
  },
  {
    slug: 'goodday',
    company: 'GoodDay',
    founder: 'Kyle',
    email: 'kyle@gooddaysoftware.com',
    domain: 'gooddaysoftware.com',
    threadId: '19ed2de6c6448fde',
    messageId: '<19ed2de6c6448fde@mail.gmail.com>',
    subject: 'Telescope <> GoodDay Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Kyle,<br><br>Chris on our team worked closely with Postscript and Chargeflow in the e-commerce space and has a good feel for what resonates with Shopify brands. Happy to connect you two if useful.</div>'
  },
  {
    slug: 'goodday',
    company: 'GoodDay',
    founder: 'Kyle',
    email: 'kyle@gooddaysoftware.com',
    domain: 'gooddaysoftware.com',
    threadId: '19ed2de6c6448fde',
    messageId: '<19ed2de6c6448fde@mail.gmail.com>',
    subject: 'Telescope <> GoodDay Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Kyle,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Happy to reconnect whenever makes sense.</div>'
  },

  // ===================== ECOURTDATE =====================
  {
    slug: 'ecourtdate',
    company: 'eCourtDate',
    founder: 'Ibrahim',
    email: 'ibrahim@ecourtdate.com',
    domain: 'ecourtdate.com',
    threadId: '19ed2de2fedee4cc',
    messageId: '<19ed2de2fedee4cc@mail.gmail.com>',
    subject: 'Telescope <> eCourtDate Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Ibrahim,<br><br>One thing I keep thinking about in the court tech space is how much money jurisdictions lose to failure-to-appear alone. I think the ROI case for what you\'re doing almost sells itself once a judge sees the actual numbers on no-shows and rebooking costs. Would love to hear what the data looks like from your side and whether courts are using that to pull you into adjacent workflows.</div>'
  },
  {
    slug: 'ecourtdate',
    company: 'eCourtDate',
    founder: 'Ibrahim',
    email: 'ibrahim@ecourtdate.com',
    domain: 'ecourtdate.com',
    threadId: '19ed2de2fedee4cc',
    messageId: '<19ed2de2fedee4cc@mail.gmail.com>',
    subject: 'Telescope <> eCourtDate Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Ibrahim,<br><br>Chris on our team has spent time around vertical SaaS companies that sell to government and understands the procurement challenges firsthand. Happy to compare notes or make intros if useful.</div>'
  },
  {
    slug: 'ecourtdate',
    company: 'eCourtDate',
    founder: 'Ibrahim',
    email: 'ibrahim@ecourtdate.com',
    domain: 'ecourtdate.com',
    threadId: '19ed2de2fedee4cc',
    messageId: '<19ed2de2fedee4cc@mail.gmail.com>',
    subject: 'Telescope <> eCourtDate Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Ibrahim,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Would love to stay connected and follow the progress.</div>'
  },

  // ===================== SCOPITO =====================
  {
    slug: 'scopito',
    company: 'Scopito',
    founder: 'Ken',
    email: 'kif@scopito.com',
    domain: 'scopito.com',
    threadId: '19ed2daf756c96f8',
    messageId: '<19ed2daf756c96f8@mail.gmail.com>',
    subject: 'Telescope <> Scopito Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Ken,<br><br>Was thinking more about the inspection analytics space. One thing that keeps coming up is how the insurance side of utilities is starting to drive adoption. Insurers are increasingly requiring better documentation and predictive data on asset condition, and I think that\'s going to create a pull-through effect for platforms that already have the data. Would love to hear if that\'s resonating with your customers.</div>'
  },
  {
    slug: 'scopito',
    company: 'Scopito',
    founder: 'Ken',
    email: 'kif@scopito.com',
    domain: 'scopito.com',
    threadId: '19ed2daf756c96f8',
    messageId: '<19ed2daf756c96f8@mail.gmail.com>',
    subject: 'Telescope <> Scopito Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Ken,<br><br>We\'ve helped a handful of European companies think through US market entry and would be happy to share what we\'ve seen work. The US utility market is massive but the buyer dynamics are different from Europe.</div>'
  },
  {
    slug: 'scopito',
    company: 'Scopito',
    founder: 'Ken',
    email: 'kif@scopito.com',
    domain: 'scopito.com',
    threadId: '19ed2daf756c96f8',
    messageId: '<19ed2daf756c96f8@mail.gmail.com>',
    subject: 'Telescope <> Scopito Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Ken,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Would love to stay connected.</div>'
  },

  // ===================== EHAWK =====================
  {
    slug: 'ehawk',
    company: 'eHawk',
    founder: 'Ted',
    email: 'tedgreen@ehawksolutions.com',
    domain: 'ehawksolutions.com',
    threadId: '19ed26e6b6139ab0',
    messageId: '<19ed26e6b6139ab0@mail.gmail.com>',
    subject: 'Telescope <> eHawk Intro',
    emailNumber: 2,
    sendDate: '2026-06-19',
    status: 'pending',
    body: '<div>Hey Ted,<br><br>One thing I\'ve been thinking about since reaching out is how the shift toward alternatives to incarceration is creating real demand for monitoring technology that actually works. Most counties are under pressure to reduce jail populations but still need accountability, and I think the smartphone approach makes so much more sense than the ankle monitor model. Would love to hear how the conversation with agencies has shifted over the past year.</div>'
  },
  {
    slug: 'ehawk',
    company: 'eHawk',
    founder: 'Ted',
    email: 'tedgreen@ehawksolutions.com',
    domain: 'ehawksolutions.com',
    threadId: '19ed26e6b6139ab0',
    messageId: '<19ed26e6b6139ab0@mail.gmail.com>',
    subject: 'Telescope <> eHawk Intro',
    emailNumber: 3,
    sendDate: '2026-06-24',
    status: 'pending',
    body: '<div>Hey Ted,<br><br>Chris on our team has done a lot of work in vertical SaaS and govtech and understands the government procurement cycle well. Happy to set up a quick intro if helpful.</div>'
  },
  {
    slug: 'ehawk',
    company: 'eHawk',
    founder: 'Ted',
    email: 'tedgreen@ehawksolutions.com',
    domain: 'ehawksolutions.com',
    threadId: '19ed26e6b6139ab0',
    messageId: '<19ed26e6b6139ab0@mail.gmail.com>',
    subject: 'Telescope <> eHawk Intro',
    emailNumber: 4,
    sendDate: '2026-06-26',
    status: 'pending',
    body: '<div>Hey Ted,<br><br>Bumping this one last time. If now isn\'t the right time, totally understand. Would love to reconnect with Martha included whenever it makes sense.</div>'
  }
];

async function main() {
  console.log('Fetching remote followups.json...');
  const resp = await ghApi('GET', '/contents/followups.json');
  const content = Buffer.from(resp.content, 'base64').toString('utf-8');
  const data = JSON.parse(content);
  const sha = resp.sha;

  console.log('Current entries:', data.pending.length);
  console.log('Adding', newEntries.length, 'new entries...');

  data.pending.push(...newEntries);

  console.log('New total:', data.pending.length);

  const updated = JSON.stringify(data, null, 2).replace(/\r\n/g, '\n') + '\n';
  const encoded = Buffer.from(updated).toString('base64');

  console.log('Pushing to remote...');
  await ghApi('PUT', '/contents/followups.json', {
    message: '[auto] add 39 follow-up entries for 13 companies outreached Jun 16-17',
    content: encoded,
    sha: sha
  });

  console.log('Done! Added follow-ups for:');
  const companies = [...new Set(newEntries.map(e => e.company))];
  companies.forEach(c => console.log(' ', c));
  console.log('\nSchedule: Email 2 (Jun 19), Email 3 (Jun 24), Email 4 (Jun 26)');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
