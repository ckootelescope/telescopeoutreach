const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'followups.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const newEntries = [
  // === EDDIFI (Jeremy) ===
  {
    slug: "eddifi", company: "Eddifi", founder: "Jeremy",
    email: "jeremy@eddifi.ai", domain: "eddifi.ai",
    threadId: "19e6a439ea1cdf87", messageId: "19e6a439ea1cdf87",
    subject: "Telescope <> Eddifi",
    body: "<div>Jeremy, I was looking at the state education agency side of Eddi and the model is interesting. Instead of selling district by district, when a state uses you as their grant distribution infrastructure, every local org in that state becomes a user. Curious how the MGT partnership is translating into actual pipeline on the state side.</div>",
    emailNumber: 2, sendDate: "2026-05-29", status: "pending"
  },
  {
    slug: "eddifi", company: "Eddifi", founder: "Jeremy",
    email: "jeremy@eddifi.ai", domain: "eddifi.ai",
    threadId: "19e6a439ea1cdf87", messageId: "19e6a439ea1cdf87",
    subject: "Telescope <> Eddifi",
    body: "<div>Jeremy, I spent more time looking at Eddi and the MGT partnership is what keeps coming back to me. They have 2,500+ government and education clients and you're already working together on funding management for two state education departments. Getting that kind of channel partner at the seed stage is unusual.<br><br>I'd be curious how the dynamic works in practice, whether MGT is actively introducing you into their existing client relationships or if it's more of a co-build on specific projects that opens doors downstream.</div>",
    emailNumber: 3, sendDate: "2026-06-01", status: "pending"
  },
  {
    slug: "eddifi", company: "Eddifi", founder: "Jeremy",
    email: "jeremy@eddifi.ai", domain: "eddifi.ai",
    threadId: "19e6a439ea1cdf87", messageId: "19e6a439ea1cdf87",
    subject: "Telescope <> Eddifi",
    body: "<div>Jeremy, one last thought. We invested in MedTrainer, which does compliance and training software for healthcare organizations, and there are real parallels between how they navigated selling into large institutional buyers with complex regulatory requirements. If it would be useful, happy to connect you with someone on that team who's been through a similar GTM motion.<br><br>If now isn't the right time, totally understand.</div>",
    emailNumber: 4, sendDate: "2026-06-03", status: "pending"
  },

  // === HELMET SECURITY (Fred) ===
  {
    slug: "helmet_security", company: "Helmet Security", founder: "Fred",
    email: "fred@helmetsecurity.com", domain: "helmetsecurity.com",
    threadId: "19e6a41178229ba0", messageId: "19e6a41178229ba0",
    subject: "MCP security gap | Telescope intro",
    body: "<div>Fred, I was looking at the three-pillar approach (discover, secure, govern) and I think the sequencing is smart. The natural entry point is helping security teams just figure out what MCP servers exist in their environment before they can even think about policy enforcement. Curious whether most of your early customers came in through the discovery use case or if governance was the initial pull.</div>",
    emailNumber: 2, sendDate: "2026-05-29", status: "pending"
  },
  {
    slug: "helmet_security", company: "Helmet Security", founder: "Fred",
    email: "fred@helmetsecurity.com", domain: "helmetsecurity.com",
    threadId: "19e6a41178229ba0", messageId: "19e6a41178229ba0",
    subject: "MCP security gap | Telescope intro",
    body: "<div>Fred, I spent more time on Helmet and your CyberGRX background is what I keep coming back to. You spent 8 years building the third-party cyber risk management category from scratch, raised over $100M, and took it through an exit. That experience building a category around a new attack surface feels directly relevant to what's happening with MCP servers now.<br><br>Having ~10 customers and 30 more in the pipeline five months out of stealth is solid early traction. I'd be curious how the government side of the customer base differs from commercial, whether it's more compliance-driven or if they're seeing real threat activity already.</div>",
    emailNumber: 3, sendDate: "2026-06-01", status: "pending"
  },
  {
    slug: "helmet_security", company: "Helmet Security", founder: "Fred",
    email: "fred@helmetsecurity.com", domain: "helmetsecurity.com",
    threadId: "19e6a41178229ba0", messageId: "19e6a41178229ba0",
    subject: "MCP security gap | Telescope intro",
    body: "<div>Fred, one last thought. Chris Gaertner on our team worked closely with Axonius during its growth phase, and there are real parallels between what they built for asset visibility and what Helmet is doing for MCP server visibility. If it would be useful to compare notes on category creation and early enterprise sales motion in security infrastructure, happy to connect you two directly.<br><br>If now isn't the right time, totally understand.</div>",
    emailNumber: 4, sendDate: "2026-06-03", status: "pending"
  },

  // === CODECOMPLY (Patrick) ===
  {
    slug: "codecomply", company: "CodeComply", founder: "Patrick",
    email: "phughes@codecomply.ai", domain: "codecomply.ai",
    threadId: "19e6a3fecf94880b", messageId: "19e6a3fecf94880b",
    subject: "Telescope <> CodeComply | Construction Discussion",
    body: "<div>Patrick, I was reading about the CivicPlus partnership and the distribution angle is interesting. Rather than selling to municipalities one by one, being embedded in the platform that 13,000+ government agencies already use is a completely different GTM motion. Curious how that partnership came together and whether you're seeing pull from the municipal side or the architecture firm side first.</div>",
    emailNumber: 2, sendDate: "2026-05-29", status: "pending"
  },
  {
    slug: "codecomply", company: "CodeComply", founder: "Patrick",
    email: "phughes@codecomply.ai", domain: "codecomply.ai",
    threadId: "19e6a3fecf94880b", messageId: "19e6a3fecf94880b",
    subject: "Telescope <> CodeComply | Construction Discussion",
    body: "<div>Patrick, the more I look at CodeComply, the more the founding team stands out. Having Patrick Murphy coming from Coastal Construction and the Togal AI build, plus Michael Sheehan with 13 years at SOCOTEC doing fire protection engineering, means the people building this actually lived the plan review process from both sides. I think that domain depth matters a lot in construction because the tolerance for error is basically zero when you're talking about fire codes and ADA.<br><br>I'd be curious how the 98% accuracy claim holds up across different code types and whether certain categories like fire or accessibility are harder than others.</div>",
    emailNumber: 3, sendDate: "2026-06-01", status: "pending"
  },
  {
    slug: "codecomply", company: "CodeComply", founder: "Patrick",
    email: "phughes@codecomply.ai", domain: "codecomply.ai",
    threadId: "19e6a3fecf94880b", messageId: "19e6a3fecf94880b",
    subject: "Telescope <> CodeComply | Construction Discussion",
    body: "<div>Patrick, one more thought. Harrison Doyle on our team was VP of Finance at Procore, so he spent years watching how construction software gets adopted and where the resistance shows up. If it would be useful to get his perspective on selling into the AEC space, happy to make that connection.<br><br>If now isn't the right time, totally understand.</div>",
    emailNumber: 4, sendDate: "2026-06-03", status: "pending"
  },

  // === USERJOURNEYS (Lauri) ===
  {
    slug: "userjourneys", company: "UserJourneys", founder: "Lauri",
    email: "lauri@userjourneys.ai", domain: "userjourneys.ai",
    threadId: "19e6a3b81b96de31", messageId: "19e6a3b81b96de31",
    subject: "Telescope <> UserJourneys Intro",
    body: "<div>Lauri, I was looking at how you guys trigger the AI interviews based on behavioral signals rather than random sampling. I think that's the right approach because the most useful feedback comes from users at the exact moment something breaks, not from a survey link they get two weeks later. Curious how many interviews it typically takes before the product graph starts surfacing actionable patterns.</div>",
    emailNumber: 2, sendDate: "2026-05-29", status: "pending"
  },
  {
    slug: "userjourneys", company: "UserJourneys", founder: "Lauri",
    email: "lauri@userjourneys.ai", domain: "userjourneys.ai",
    threadId: "19e6a3b81b96de31", messageId: "19e6a3b81b96de31",
    subject: "Telescope <> UserJourneys Intro",
    body: "<div>Lauri, the Jungler case study caught my attention. Doubling their conversion rate by catching bugs and UI issues that were silently killing conversions is a strong proof point. I think the interesting part is that most session replay tools would have shown the drop-off but wouldn't have told the team why users were bouncing, and most interview tools wouldn't have known who to ask or when. The combination is what makes the closed loop work.<br><br>I'd be curious whether you're seeing more pull from PLG companies trying to optimize onboarding or from teams trying to reduce churn in mature products.</div>",
    emailNumber: 3, sendDate: "2026-06-01", status: "pending"
  },
  {
    slug: "userjourneys", company: "UserJourneys", founder: "Lauri",
    email: "lauri@userjourneys.ai", domain: "userjourneys.ai",
    threadId: "19e6a3b81b96de31", messageId: "19e6a3b81b96de31",
    subject: "Telescope <> UserJourneys Intro",
    body: "<div>Lauri, last thought from me. We've worked closely with companies in the PLG space like Calendly and Expensify, and the analytics-to-action gap you're solving is something that comes up constantly. If it would be useful, happy to connect you with a couple of product leaders in our network who are actively trying to solve this problem.<br><br>If now isn't the right time, totally understand.</div>",
    emailNumber: 4, sendDate: "2026-06-03", status: "pending"
  },

  // === SIMPLE (Catheryn) ===
  {
    slug: "simple", company: "Simple", founder: "Catheryn",
    email: "catheryn@usesimple.ai", domain: "usesimple.ai",
    threadId: "19e6a3ae41373663", messageId: "19e6a3ae41373663",
    subject: "Telescope <> Simple",
    body: "<div>Catheryn, I was looking at how you guys built the entire voice stack from scratch rather than stitching together off-the-shelf APIs. I think that matters more than people realize because latency and natural conversation flow are what determine whether a caller hangs up or stays on the line. The 850ms full-pipeline latency is impressive. Curious whether you're seeing more demand from companies wanting to augment their existing call center teams or fully replace them.</div>",
    emailNumber: 2, sendDate: "2026-05-29", status: "pending"
  },
  {
    slug: "simple", company: "Simple", founder: "Catheryn",
    email: "catheryn@usesimple.ai", domain: "usesimple.ai",
    threadId: "19e6a3ae41373663", messageId: "19e6a3ae41373663",
    subject: "Telescope <> Simple",
    body: "<div>Catheryn, I've been thinking about Simple and the Omaha Steaks detail is what sticks with me. Their phone sales operation is legendary, and your AI is outselling their seasonal reps while callers are calling the agent 'honey.' That's not something you get with a generic voice API. I think the positioning on the revenue side rather than the cost-savings side is smart because it changes the buyer conversation from 'how much can we cut' to 'how much more can we make.'<br><br>I'd be curious how the self-storage and home insurance deployments compare to retail in terms of complexity and whether certain verticals need fundamentally different voice tuning.</div>",
    emailNumber: 3, sendDate: "2026-06-01", status: "pending"
  },
  {
    slug: "simple", company: "Simple", founder: "Catheryn",
    email: "catheryn@usesimple.ai", domain: "usesimple.ai",
    threadId: "19e6a3ae41373663", messageId: "19e6a3ae41373663",
    subject: "Telescope <> Simple",
    body: "<div>Catheryn, one more thought. We invested in Fathom (meeting recorder) and Chris worked with Otter AI, so we've seen the voice AI space evolve from different angles. If it would be useful to compare notes on how those companies navigated enterprise sales and the audio quality bar that buyers care about, happy to make an intro.<br><br>If now isn't the right time, totally understand.</div>",
    emailNumber: 4, sendDate: "2026-06-03", status: "pending"
  },

  // === ANCHOR BROWSER (Idan) ===
  {
    slug: "anchor_browser", company: "Anchor Browser", founder: "Idan",
    email: "idan@anchorbrowser.io", domain: "anchorbrowser.io",
    threadId: "19e6a176f8456732", messageId: "19e6a176f8456732",
    subject: "security-first browser infra | Telescope intro",
    body: "<div>Idan, I was reading about the Web Action Cache approach and I think the architecture is interesting. Moving AI to the planning stage only and then executing cached workflows deterministically is a different bet than most browser automation companies are making. Curious whether enterprise customers are primarily buying on the reliability advantage or the cost advantage from using fewer tokens.</div>",
    emailNumber: 2, sendDate: "2026-05-29", status: "pending"
  },
  {
    slug: "anchor_browser", company: "Anchor Browser", founder: "Idan",
    email: "idan@anchorbrowser.io", domain: "anchorbrowser.io",
    threadId: "19e6a176f8456732", messageId: "19e6a176f8456732",
    subject: "security-first browser infra | Telescope intro",
    body: "<div>Idan, the Cloudflare partnership is what keeps coming back to me about Anchor. Being officially verified by the company whose job is blocking bots is not something competitors can easily replicate. And the Groq deal, powering their Compound research agent in production, is strong validation from one of the most visible AI infrastructure companies out there.<br><br>I'd be curious how you're thinking about the pricing model as usage scales, whether credits-based works at enterprise volumes or if you end up moving to something more predictable.</div>",
    emailNumber: 3, sendDate: "2026-06-01", status: "pending"
  },
  {
    slug: "anchor_browser", company: "Anchor Browser", founder: "Idan",
    email: "idan@anchorbrowser.io", domain: "anchorbrowser.io",
    threadId: "19e6a176f8456732", messageId: "19e6a176f8456732",
    subject: "security-first browser infra | Telescope intro",
    body: "<div>Idan, one last thought. Chris Gaertner on our team has deep relationships in the security infrastructure space from his work with Axonius and JumpCloud. If it would be useful to get introductions to CISOs and security leaders who are evaluating how to manage AI agent access in their environments, happy to make those connections.<br><br>If now isn't the right time, totally understand.</div>",
    emailNumber: 4, sendDate: "2026-06-03", status: "pending"
  },

  // === ARGA LABS (Phillip) ===
  {
    slug: "arga_labs", company: "Arga Labs", founder: "Phillip",
    email: "phillip@argalabs.com", domain: "argalabs.com",
    threadId: "19e6a14758ebf4f0", messageId: "19e6a14758ebf4f0",
    subject: "Telescope <> Arga Connect",
    body: "<div>Phillip, I was reading about the pivot mid-YC from testing AI-generated code to building full sandbox environments for AI agents, and I think it's the right move. The problem gets way harder when agents are making Stripe charges and sending Slack messages in production versus just writing code that a human reviews. Curious how the onboarding experience works for teams that want to add new SaaS twins beyond the ones you already support.</div>",
    emailNumber: 2, sendDate: "2026-05-29", status: "pending"
  },
  {
    slug: "arga_labs", company: "Arga Labs", founder: "Phillip",
    email: "phillip@argalabs.com", domain: "argalabs.com",
    threadId: "19e6a14758ebf4f0", messageId: "19e6a14758ebf4f0",
    subject: "Telescope <> Arga Connect",
    body: "<div>Phillip, I've been thinking more about Arga and the origin story resonates. Building a dev tool at Amazon that saved 10 weeks of engineering time a year, then realizing the same problem exists everywhere, is exactly the kind of thing that leads to a real company. I think the timing is right because every company deploying AI agents is about to run into the same testing wall you saw firsthand.<br><br>Onboarding Series A companies and seed-stage startups within your first 8 weeks at YC is solid early traction. I'd be curious whether the pull you're seeing is more from teams building agents for internal use or from companies whose product is the agent itself.</div>",
    emailNumber: 3, sendDate: "2026-06-01", status: "pending"
  },
  {
    slug: "arga_labs", company: "Arga Labs", founder: "Phillip",
    email: "phillip@argalabs.com", domain: "argalabs.com",
    threadId: "19e6a14758ebf4f0", messageId: "19e6a14758ebf4f0",
    subject: "Telescope <> Arga Connect",
    body: "<div>Phillip, one more thought. We've worked with companies across the dev tools and infrastructure space, and Chris on our team has experience with Datadog and companies building developer-facing products. If it would be useful to compare notes on pricing models and enterprise sales motion for infrastructure tools, happy to make an intro.<br><br>If now isn't the right time, totally understand.</div>",
    emailNumber: 4, sendDate: "2026-06-03", status: "pending"
  }
];

data.pending.push(...newEntries);
fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
console.log('Added ' + newEntries.length + ' new entries. Total pending: ' + data.pending.length);
