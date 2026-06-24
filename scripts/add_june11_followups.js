const https = require('https');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

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

const companies = [
  {
    slug: 'buildcognition', company: 'BuildCognition', founder: 'Mark', email: 'mark@buildcognition.com',
    domain: 'buildcognition.com', threadId: '19ead8b62cb413fd', messageId: '19ead8b62cb413fd',
    subject: 'Telescope <> BuildCognition Intro',
    email2: '<div>Hey Mark, I was looking at how you guys approach the site-level quality inspection workflow. Curious whether GCs are typically discovering you through their subs or the other way around.</div>',
    email3: '<div>Mark, our Head of Ops Harrison Doyle is a former VP of Finance at Procore, so construction quality and inspection workflows are something we know well. Happy to make any relevant intros if useful.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Mark, been thinking more about how quality data from the field could feed into preconstruction estimates and risk scoring down the line. I think there\'s something interesting in using historical defect data to predict where problems will show up on future projects.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'grantd', company: 'Grantd', founder: 'Brian', email: 'brian.mcdonald@grantdequity.com',
    domain: 'grantdequity.com', threadId: '19ebd0aad1ffa480', messageId: '19ebd0aad1ffa480',
    subject: 'Telescope <> Grantd Intro',
    email2: '<div>Hey Brian, I was looking at how you guys handle the cross-platform equity data problem. Curious how companies are typically managing the transition from their existing cap table tools.</div>',
    email3: '<div>Brian, we\'ve worked with a few companies where equity comp becomes a retention bottleneck as they scale past 100 employees. Happy to share what we\'ve heard about what\'s working and what\'s not.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Brian, the complexity around international equity grants keeps coming up in conversations with portfolio companies that have distributed teams. I think there\'s a real gap in tooling for managing equity across jurisdictions.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'marble_ai', company: 'Marble AI', founder: 'Jason', email: 'jason.kilgour@marble-ai.com',
    domain: 'marble-ai.com', threadId: '19eb71f77ed5c235', messageId: '19eb71f77ed5c235',
    subject: 'Telescope <> Marble AI',
    email2: '<div>Hey Jason, I was looking at how Marble approaches the clinical data piece. Curious how health systems are responding to the AI approach given how sensitive they tend to be about patient data.</div>',
    email3: '<div>Jason, we\'ve made a few investments in healthcare including Passage Health and Canid, and the common thread is that domain expertise is the moat. Happy to share what we\'ve seen work in terms of health system sales cycles.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Jason, I keep coming back to the fact that healthcare AI products with real clinical expertise behind them convert at a totally different rate than generic AI tools trying to break into the space. That\'s a hard advantage to replicate.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'unkey', company: 'Unkey', founder: 'James', email: 'james@unkey.dev',
    domain: 'unkey.dev', threadId: '19eb71c88abe1483', messageId: '19eb71c88abe1483',
    subject: 'Telescope <> Unkey',
    email2: '<div>Hey James, I was looking at the rate limiting and key analytics features. Curious how developers are discovering Unkey and whether it\'s more organic or through specific integration channels.</div>',
    email3: '<div>James, Chris on our team was relatively early at Datadog and has seen how developer tools tend to land and expand. Happy to share what\'s worked for other dev-tool companies we\'ve backed.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>James, as more companies deploy AI agents that need API access management, I think the usage-based billing and permissions layer becomes critical infrastructure. Curious if you\'re seeing pull from that use case.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'woodrow', company: 'Woodrow', founder: 'Sidharth', email: 'sidharth@woodrow.ai',
    domain: 'woodrow.ai', threadId: '19eb71bd1dfba1c9', messageId: '19eb71bd1dfba1c9',
    subject: 'Telescope <> Woodrow',
    email2: '<div>Hey Sidharth, I was looking at how Woodrow handles the multi-source data matching problem. Curious whether you\'re seeing more pull from finance teams or ops teams as the initial buyer.</div>',
    email3: '<div>Sidharth, a few portfolio companies we work with have gone through painful reconciliation processes when scaling past a certain transaction volume. Happy to share what we\'ve seen work in terms of landing enterprise finance teams.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Sidharth, I think the companies that win in reconciliation will be the ones that sit on enough transaction data to start predicting mismatches before they happen. That\'s a compounding advantage over time.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'meridian', company: 'Meridian', founder: 'Kashyap', email: 'kn@trymeridian.dev',
    domain: 'trymeridian.dev', threadId: '19eb71875803fc7a', messageId: '19eb71875803fc7a',
    subject: 'Telescope <> Meridian',
    email2: '<div>Hey Kashyap, I was looking at how Meridian approaches the scoping and deliverable generation piece. Curious whether your initial customers tend to be boutique firms or larger consultancies.</div>',
    email3: '<div>Kashyap, we\'ve backed a few companies in the theme of AI replacing billable work rather than just augmenting it, and the ones that win tend to nail the output quality bar on day one. Happy to share what we\'ve seen.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Kashyap, the more I think about it, the more I think consulting is one of those markets where the buyer is paying for the deliverable, not the hours. If the deliverable quality is the same, the pricing model can completely change.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'piper', company: 'Piper', founder: 'Ido', email: 'ido@piper-ai.com',
    domain: 'piper-ai.com', threadId: '19eb717f0154a17b', messageId: '19eb717f0154a17b',
    subject: 'Telescope <> Piper Intro',
    email2: '<div>Hey Ido, I was looking at how Piper handles the plan review and takeoff process. Curious how estimators are reacting to the AI approach versus the manual workflows they\'re used to.</div>',
    email3: '<div>Ido, our Head of Ops Harrison Doyle is a former VP of Finance at Procore, so preconstruction workflows are something we follow closely. Happy to make intros if useful.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Ido, preconstruction is one of those areas where a single missed line item in a bid can cost a GC six figures. I think the AI accuracy bar needs to be incredibly high for estimators to trust it, and the companies that get there first will have a real advantage.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'signalcore', company: 'Signalcore', founder: 'Justin', email: 'justin.behar@gmail.com',
    domain: 'gmail.com', threadId: '19eb4efd80938506', messageId: '19eb4efd80938506',
    subject: 'AI evaluation infrastructure | Telescope intro',
    email2: '<div>Hey Justin, I was looking at the evaluation framework you guys are building. Curious how procurement teams are currently navigating AI vendor selection without standardized benchmarks.</div>',
    email3: '<div>Justin, as more enterprises deploy multiple AI vendors, we keep hearing that evaluation and selection is becoming a bottleneck. Happy to share what we\'re hearing from the buyer side if useful.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Justin, I think the interesting thing about AI evaluation is that it\'s not a one-time procurement decision anymore. Models change, pricing changes, quality drifts. The company that owns continuous evaluation has a really sticky position.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'product_ai', company: 'Product.ai', founder: 'Michael', email: 'michaelquoc@gmail.com',
    domain: 'gmail.com', threadId: '19eb4ef8af6c164f', messageId: '19eb4ef8af6c164f',
    subject: 'Telescope <> Product.ai',
    email2: '<div>Hey Michael, been thinking more about the ground truth verification angle. Curious how you\'re approaching the data freshness challenge when deals and coupons change so frequently.</div>',
    email3: '<div>Michael, as AI shopping agents scale up, I think the verification layer becomes more valuable, not less. Happy to share what we\'re seeing in the agentic commerce space from the investor side.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Michael, the more I dig into this space, the more I think ground truth verification is a wedge into something bigger. If you own the real-time accuracy layer for commerce, that data becomes incredibly valuable to anyone building shopping agents.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'ntwist', company: 'NTWIST', founder: 'Chowdary', email: 'cmeenavilli@ntwist.com',
    domain: 'ntwist.com', threadId: '19eb4e86375c910a', messageId: '19eb4e86375c910a',
    subject: 'Telescope <> NTWIST',
    email2: '<div>Hey Chowdary, I was looking at how NTWIST handles the integration with existing SCADA and historian systems. Curious how long it typically takes to get a plant live on the platform.</div>',
    email3: '<div>Chowdary, Chris on our team worked with Parabola and Project44, so industrial data and supply chain optimization is a space we\'ve spent real time in. Happy to share what we\'ve seen work in terms of manufacturing sales cycles.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Chowdary, mining and manufacturing operators generate massive amounts of data but most of it just sits in historians unused. I think the companies that can turn that into real-time operational decisions without requiring a team of data scientists on-site will win big.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'promptarmor', company: 'PromptArmor', founder: 'Shankar', email: 'shankar@promptarmor.com',
    domain: 'promptarmor.com', threadId: '19eb4e7b65a10e37', messageId: '19eb4e7b65a10e37',
    subject: 'Telescope <> PromptArmor',
    email2: '<div>Hey Shankar, I was looking at how PromptArmor approaches the vendor risk scoring piece. Curious whether you\'re seeing more pull from security teams or from the procurement side.</div>',
    email3: '<div>Shankar, Chris on our team worked with Axonius and JumpCloud, so security tooling is a space we know well. As every vendor embeds AI, the third-party risk surface is expanding fast. Happy to share what we\'re hearing from CISOs.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Shankar, I think AI security risk is moving faster than most security teams can evaluate on their own. The company that can automate that evaluation and give CISOs confidence to approve new tools will be in a really strong position.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'lava', company: 'Lava', founder: 'Mitchell', email: 'mitchell@lavapayments.com',
    domain: 'lavapayments.com', threadId: '19eb4e78777b6b09', messageId: '19eb4e78777b6b09',
    subject: 'Telescope <> Lava',
    email2: '<div>Hey Mitchell, I was looking at the tool and API connectivity layer you guys are building for agents. Curious whether you\'re seeing more demand from companies building their own agents or teams deploying third-party ones.</div>',
    email3: '<div>Mitchell, as AI agents proliferate, the infrastructure layer underneath them is becoming critical. Happy to share what we\'re seeing across our portfolio in terms of how companies are actually deploying agents in production.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Mitchell, I think the connectivity and orchestration layer for AI agents is going to look a lot like what happened with APIs a decade ago. The companies that own the plumbing early tend to become very sticky.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'luzid', company: 'Luzid', founder: 'Andres', email: 'andres@luzid.io',
    domain: 'luzid.io', threadId: '19eb4e7544001d91', messageId: '19eb4e7544001d91',
    subject: 'Telescope <> Luzid',
    email2: '<div>Hey Andres, I was looking at how Luzid handles the documentation and mapping phase of ERP implementations. Curious whether you\'re seeing more traction with specific ERP platforms like SAP or NetSuite.</div>',
    email3: '<div>Andres, we\'ve seen a pattern across our portfolio where AI that replaces professional services rather than just augmenting them tends to have much stronger unit economics. Happy to share what we\'ve seen work in positioning against systems integrators.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Andres, ERP implementations are one of those areas where the documentation and process mapping alone can cost more than the software license. I think automating that piece is the right wedge because it\'s the most painful and most repeatable part of the project.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'sevii', company: 'Sevii', founder: 'Curt', email: 'curt.aubley@sevii.ai',
    domain: 'sevii.ai', threadId: '19eb4e70f8eeb2bb', messageId: '19eb4e70f8eeb2bb',
    subject: 'Telescope <> Sevii',
    email2: '<div>Hey Curt, I was looking at how Sevii bridges the gap between alert detection and actual response. Curious how SOC teams are reacting to the automated response approach versus their existing playbooks.</div>',
    email3: '<div>Curt, Chris on our team worked with Axonius and JumpCloud, and one thing we keep hearing is that SOC teams are drowning in alerts they can\'t act on fast enough. Happy to share what we\'re hearing about buying patterns in security.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Curt, I think the gap between detection and response is where most of the actual damage happens in a breach. The tools that can compress that window from hours to minutes are solving a problem every CISO loses sleep over.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'hilt', company: 'Hilt', founder: 'William', email: 'william@hilt.ai',
    domain: 'hilt.ai', threadId: '19eb4e6d95bcaaa3', messageId: '19eb4e6d95bcaaa3',
    subject: 'Telescope <> Hilt',
    email2: '<div>Hey William, I was looking at how Hilt approaches real-time data movement monitoring. Curious whether you\'re seeing more demand from compliance-driven buyers or security-driven ones.</div>',
    email3: '<div>William, Chris on our team has worked with companies like Axonius in the security space, and one pattern we keep seeing is that the products that sit on the data path rather than just the log path end up being much stickier. Happy to share more on what we\'ve seen.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>William, most data security tools are reactive by design. I think the shift to monitoring data movement in real time rather than analyzing logs after the fact is where the market needs to go.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'corbel', company: 'Corbel', founder: "Le'Ora", email: 'leora@corbelpay.com',
    domain: 'corbelpay.com', threadId: '19eb4e6ac8ae21de', messageId: '19eb4e6ac8ae21de',
    subject: 'Telescope <> Corbel',
    email2: '<div>Hey Le\'Ora, I was looking at how Corbel handles the quoting and configuration process for equipment sales. Curious whether your initial traction has been more with OEMs or with dealers and distributors.</div>',
    email3: '<div>Le\'Ora, we\'ve seen a pattern where vertical commerce tools that own the quoting process tend to expand naturally into financing and payments. Happy to share what we\'ve seen work in similar verticals.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Le\'Ora, capital equipment sales is one of those workflows where a rep might spend hours building a custom quote that could be generated in minutes with the right tooling. I think there\'s a real opportunity to own the commercial layer for this market.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'cleavr', company: 'Cleavr', founder: 'Baptiste', email: 'baptiste.nassoy@cleavr.fr',
    domain: 'cleavr.fr', threadId: '19eb4e5fdd4a0530', messageId: '19eb4e5fdd4a0530',
    subject: 'Telescope <> Cleavr',
    email2: '<div>Hey Baptiste, I was looking at how Cleavr handles the escalation workflow from friendly reminder to formal collection. Curious whether you\'re seeing more traction in specific industries or if it\'s horizontal.</div>',
    email3: '<div>Baptiste, we\'ve backed companies in the payments and fintech space and the common theme is that automating the last mile of cash collection tends to have incredibly clear ROI for buyers. Happy to share what we\'ve seen work.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Baptiste, I think the interesting thing about collections automation is that it touches both the finance team and the customer relationship. Getting the tone right at scale is a hard problem, and the companies that crack it will own a critical piece of the AR workflow.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'loophole_labs', company: 'Loophole Labs', founder: 'Shiv', email: 'shivansh@loopholelabs.io',
    domain: 'loopholelabs.io', threadId: '19eb4e5791d9ab4b', messageId: '19eb4e5791d9ab4b',
    subject: 'Telescope <> Loophole Intro',
    email2: '<div>Hey Shiv, I was looking at the approach you guys are taking to Kubernetes optimization. Curious how you\'re differentiating against the existing tools that engineering teams have tried and abandoned.</div>',
    email3: '<div>Shiv, Chris on our team was involved with Datadog early on, so infrastructure tooling is a space we follow closely. The companies that make complex infrastructure decisions simpler tend to grow really fast once they hit PMF. Happy to share what we\'ve seen.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Shiv, every engineering team I hear from mentions Kubernetes cost as a growing pain point, but most existing tools require too much configuration to deliver value. I think the companies that automate the optimization rather than just surfacing dashboards will win this market.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'autyvia', company: 'Autyvia', founder: 'John', email: 'john.amacker@autyvia.com',
    domain: 'autyvia.com', threadId: '19eb4e52f1df588a', messageId: '19eb4e52f1df588a',
    subject: 'Telescope <> Autyvia Intro',
    email2: '<div>Hey John, I was looking at how Autyvia captures the relationship intelligence that typically walks out the door when a BD rep leaves. Curious whether you\'re landing more with ENR Top 400 firms or regional players.</div>',
    email3: '<div>John, our Head of Ops Harrison Doyle is a former VP of Finance at Procore, so AEC is a space we know deeply. Happy to make intros to firms in our network if useful.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>John, the institutional knowledge problem in AEC gets more expensive every time a senior BD person leaves and takes their relationships with them. I think the companies that can systematize that knowledge have a massive retention advantage.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'respan', company: 'Respan', founder: 'Raymond', email: 'raymond@respan.ai',
    domain: 'respan.ai', threadId: '19eb4e48e10dc3e8', messageId: '19eb4e48e10dc3e8',
    subject: 'Telescope <> Respan',
    email2: '<div>Hey Raymond, I was looking at how Respan approaches the observability and routing layer. Curious how you\'re thinking about differentiation as more companies enter this space.</div>',
    email3: '<div>Raymond, Chris on our team worked with DataRobot, so ML infrastructure is a space we follow closely. The companies that own the data layer in AI infrastructure tend to build really strong moats. Happy to share what we\'ve seen.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Raymond, I think the companies that win in LLM observability will be the ones that move beyond monitoring into active optimization. Routing, cost management, and quality scoring are all wedges that get stickier over time.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'lemhi', company: 'Lemhi', founder: 'John', email: 'john.harden@lemhi.com',
    domain: 'lemhi.com', threadId: '19eb4e11f154618d', messageId: '19eb4e11f154618d',
    subject: 'Telescope <> Lemhi',
    email2: '<div>Hey John, I was looking at how Lemhi packages the AI offering for MSPs. Curious whether MSPs are typically white-labeling it or using it as their own managed service.</div>',
    email3: '<div>John, Chris on our team invested in MSP companies like Rewst and Auvik, and one thing we keep hearing is that MSPs want to offer AI but don\'t have the engineering resources to build it themselves. Happy to share what we\'ve learned about the channel.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>John, every MSP conference has AI as the top topic right now, but most MSPs are still figuring out what to actually offer clients. I think the company that gives MSPs a turnkey AI product they can sell immediately has a really clear distribution advantage.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'bilrost', company: 'Bilrost', founder: 'Silvia', email: 'silvia@bilrost.ai',
    domain: 'bilrost.ai', threadId: '19eb4def4d184581', messageId: '19eb4def4d184581',
    subject: 'Telescope <> Bilrost',
    email2: '<div>Hey Silvia, I was looking at how Bilrost handles the document extraction and underwriting workflow. Curious how lenders are responding to the AI approach versus their existing manual processes.</div>',
    email3: '<div>Silvia, Chris on our team has worked with companies in financial services, and one pattern we keep seeing is that automating the document-heavy parts of underwriting has some of the clearest ROI in fintech. Happy to share what we\'ve seen work.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Silvia, commercial loan processing is one of those workflows where an underwriter might pull data from 15 different documents to make one decision. I think the companies that can collapse that into a single automated step will save lenders an enormous amount of time per deal.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'nexxa', company: 'Nexxa', founder: 'Philipp', email: 'philipp@nexxa.ai',
    domain: 'nexxa.ai', threadId: '19eb4dc4c7bca672', messageId: '19eb4dc4c7bca672',
    subject: 'Telescope <> Nexxa Intro',
    email2: '<div>Hey Philipp, I was looking at how Nexxa captures the tribal knowledge that lives in engineers\' heads at aerospace and defense companies. Curious how you\'re approaching the initial data ingestion challenge.</div>',
    email3: '<div>Philipp, we\'ve seen a pattern where companies that own the institutional knowledge layer in a vertical end up becoming the system of record for critical workflows. Happy to share what we\'ve seen across manufacturing and industrial verticals.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Philipp, the knowledge management problem in aerospace and defense is especially acute because the workforce is aging and the domain expertise is incredibly hard to replace. I think the companies that can capture that knowledge before it walks out the door have a time-sensitive advantage.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'fearn', company: 'Fearn', founder: 'Han', email: 'han@fearn.ai',
    domain: 'fearn.ai', threadId: '19eb4db916491e7f', messageId: '19eb4db916491e7f',
    subject: 'Telescope <> Fearn',
    email2: '<div>Hey Han, congrats again on the raise. I was looking at how Fearn approaches the prior art search and claim drafting process. Curious how patent attorneys are reacting to the AI-generated output quality.</div>',
    email3: '<div>Han, we love the theme of AI replacing professional services that are currently billed by the hour. The companies that can deliver the same quality at a fraction of the cost tend to grow fast. Happy to share what we\'ve seen work.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Han, patent drafting is one of those areas where a single mistake in claim language can cost a company millions in litigation. I think the AI quality bar is higher here than almost any other legal workflow, and the companies that meet it will own the market.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'moritz', company: 'Moritz', founder: 'Pamir', email: 'pamir@moritzlegal.com',
    domain: 'moritzlegal.com', threadId: '19eb4d93f4b4c3b7', messageId: '19eb4d93f4b4c3b7',
    subject: 'Telescope <> Moritz Intro',
    email2: '<div>Hey Pamir, congrats again on the seed. I was looking at how Moritz handles the end-to-end legal workflow. Curious whether your initial traction has been more with startups or with SMBs that have existing outside counsel.</div>',
    email3: '<div>Pamir, we love the theme of AI that replaces a full service rather than just making it faster. Legal is one of those markets where the hourly billing model creates a natural opening for a completely different pricing approach. Happy to share what we\'ve seen work.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Pamir, I think legal is going through the same transformation that tax prep went through a decade ago. The routine work gets automated, the pricing drops, and the firms that adapt become more advisory. The company that owns the automated layer wins big.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'artificial_societies', company: 'Artificial Societies', founder: 'James', email: 'james@societies.io',
    domain: 'societies.io', threadId: '19eb4d61b36a7c76', messageId: '19eb4d61b36a7c76',
    subject: 'Artificial Societies + Telescope',
    email2: '<div>Hey James, I was looking at how Artificial Societies generates synthetic perspectives at scale. Curious how research teams are validating the output quality against traditional survey methods.</div>',
    email3: '<div>James, we\'ve seen increasing demand from portfolio companies for faster ways to get market research and customer insights without waiting weeks for traditional methods. Happy to share what we\'re hearing on the buyer side.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>James, I think the shift from asking 100 people a question over 6 weeks to generating hundreds of synthetic perspectives in hours could fundamentally change how companies make product and strategy decisions. The accuracy question is the key unlock.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  },
  {
    slug: 'acclaim', company: 'Acclaim', founder: 'Jared', email: 'jared.king@withacclaim.com',
    domain: 'withacclaim.com', threadId: '19eb4926e72680c0', messageId: '19eb4926e72680c0',
    subject: 'Telescope <> Acclaim Intro',
    email2: '<div>Hey Jared, I was looking at how Acclaim handles the payment processing workflow for insurance. Curious whether you\'re seeing more traction with carriers or with agencies and brokers.</div>',
    email3: '<div>Jared, Chris on our team has connections to the insurance distribution side through his work with iLife, and one thing we keep hearing is that payment friction is still one of the biggest operational bottlenecks. Happy to make intros if useful.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>',
    email4: '<div>Jared, insurance payments are one of those workflows where everyone knows it\'s broken but the switching cost of fixing it has historically been too high. I think the companies that can plug into existing systems without requiring a rip-and-replace will win this market.<br><br>If now isn\'t the right time, totally understand. But would love to connect whenever there\'s a window.</div>'
  }
];

async function main() {
  console.log('Fetching remote followups.json...');
  const resp = await ghApi('GET', '/contents/followups.json');
  const content = Buffer.from(resp.content, 'base64').toString('utf-8');
  const config = JSON.parse(content);
  const sha = resp.sha;
  console.log('Remote has', config.pending.length, 'entries (sha:', sha.slice(0, 7) + ')');

  const existingSlugs = new Set(config.pending.map(e => e.slug + '_' + e.emailNumber));
  let added = 0;

  for (const c of companies) {
    const emails = [
      { num: 2, date: '2026-06-17', body: c.email2 },
      { num: 3, date: '2026-06-20', body: c.email3 },
      { num: 4, date: '2026-06-22', body: c.email4 }
    ];
    for (const e of emails) {
      const key = c.slug + '_' + e.num;
      if (existingSlugs.has(key)) {
        console.log('  SKIP (exists):', c.company, 'Email', e.num);
        continue;
      }
      config.pending.push({
        slug: c.slug,
        company: c.company,
        founder: c.founder,
        email: c.email,
        domain: c.domain,
        threadId: c.threadId,
        messageId: c.messageId,
        subject: c.subject,
        body: e.body,
        emailNumber: e.num,
        sendDate: e.date,
        status: 'pending'
      });
      added++;
    }
  }

  console.log('Added', added, 'new entries for', companies.length, 'companies');
  console.log('Total entries now:', config.pending.length);

  const newContent = JSON.stringify(config, null, 2).replace(/\r\n/g, '\n') + '\n';
  const encoded = Buffer.from(newContent).toString('base64');

  console.log('Pushing to remote...');
  await ghApi('PUT', '/contents/followups.json', {
    message: '[auto] add ' + added + ' follow-up entries for ' + companies.length + ' June 11 outreach companies',
    content: encoded,
    sha: sha
  });
  console.log('Done! Remote updated.');
  console.log('Email 2 due: 2026-06-17, Email 3 due: 2026-06-20, Email 4 due: 2026-06-22');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
