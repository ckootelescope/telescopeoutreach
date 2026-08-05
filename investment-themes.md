# Investment Themes

Themes Calvin is actively sourcing against. These pertain to a number of markets and evolve
as new themes emerge through founder conversations and market calls.

**How this file is used:** the restart-outreach research subagent matches a company to ONE
primary theme (optionally one secondary) and returns the theme number. Only that theme's
section is injected into the writing context. Never inject the whole file into a writing
prompt.

---

## Theme 1: Advancements and practical applications of vision language models

Vertical software companies that embed VLMs into domain-specific workflows where switching
costs are high, training data is proprietary, and there's clear ROI around labor displacement
or error reduction. Predominantly relevant in industries where images or video play a large
role in the workflow.

**Use cases:** construction, physical security, law enforcement, manufacturing, insurance,
retail, logistics

**Example pipeline companies:** Buildcheck (AEC), Watchful (physical security), Seamflow
(manufacturing), SiteVue (manufacturing), Hetal (retail), Azimut (maritime)

---

## Theme 2: Agents executing cross-functional, multi-system workflows

Most enterprise software is siloed by function or individual tools, but the majority of
processes cut across all of them. This historically required human handoffs to reconcile data,
chase approvals, and push work forward. Agents can now read/write across these systems and
unstructured data sets, hold state across long-running workflows, and coordinate humans and
other agents. Often the value comes from displacing labor and consolidating fragmented tools
into one workflow.

This becomes very interesting because these tools are often closest to the user, so they have
an opportunity to collect the freshest data and see the outcome. This feedback loop creates
unique context that becomes a moat in how tasks are handled specific to that user or company,
becoming a system of record itself over time.

**Use cases:** procurement, revenue management (billing, CPQ, quote-to-cash), AR/AP workflows,
close reconciliation, GTM tooling (implementation, post-sales, prospecting), payroll,
onboarding, employee helpdesk, compliance and verification. Can be horizontal or vertical.

**Example pipeline companies:** Salesbricks, Aeqium, Lio, Weave, Peerbound, Noxus, Winslow,
Thera

**Reference:** https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity

---

## Theme 3: Building software for agents - enabling agentic workflows

As agents become the dominant users of software, with enterprises running orders of magnitude
more agents than people, the underlying tools need to be rebuilt around machine-readable
interfaces rather than human UIs. That means API-first design with full feature parity, native
MCP/CLI support, programmatic signup and payment, agent-specific identity, and consumption-based
pricing. Every major software category gets reimagined for non-human users at scale, with
incumbents bolting agent support onto human-centric architectures.

**Use cases:** sandbox environments, identity and authorization, communication, analytics,
observability, governance

**Example pipeline companies:** Kapa, AgentMail, PromptLayer

**Reference:** https://x.com/levie/status/2030714592238956960

---

## Theme 4: Software sold through or to third-party IT providers (MSPs)

Two versions: building tools that help IT providers run their own operations (ticketing,
billing, monitoring, documentation), and building products that IT providers resell or deploy
for their clients (security, backup, compliance). AI is opening new opportunities in both,
automating the repetitive support work these providers do manually, and making sophisticated
tools affordable enough to package as a monthly service for small businesses. The underlying
logic is a distribution advantage: rather than selling to thousands of small businesses one at
a time, you sell to the provider who already manages all of them.

**Use cases:**
- For the IT provider: ticketing/helpdesk management, billing, remote monitoring, IT
  documentation, quoting and procurement, technician dispatching, contract management
- For the IT provider's customers: endpoint and email security, backup recovery, password
  management, compliance, security training, Microsoft 365 management

**Example pipeline companies:** Lexful, Cyft, Flamingo, Petra Security, Skillset, Neo,
CloudCapsule

**Reference:** https://x.com/PeterdoyleX/status/2039010306731782583

---

## Theme 5: Verticalized agents using unstructured data processing as a wedge

In most verticals, the majority of business data sits in documents, emails, images, and forms
that legacy software can't read. AI agents that can ingest and act on this unstructured data
natively, then use that as a wedge into automating critical downstream workflows: routing a
claim, approving a loan, flagging a contract clause, coding a medical record. The moat
compounds because every document processed makes the model better at that specific domain, and
deep workflow integrations make it hard to rip out.

**Example pipeline companies:** Firstwork, Axle, Strada, Rubie, Mercura, Reform

**References:**
- https://sequoiacap.com/article/services-the-new-software/
- https://sapphireventures.com/blog/the-biggest-vertical-ai-markets-are-hiding-in-plain-sight/

---

## Theme 6: AI-native platforms replacing labor with outcome-based services

AI-native services companies compete with incumbent service providers (law firms, BPOs,
insurance ops teams, accounting firms) rather than software vendors. They sell outcomes rather
than tools, replacing manual labor and human capital spend. The structural advantage is that AI
lets them deliver the same output at a fraction of the cost and headcount. As you start
delivering services with some human involvement, you eventually automate more of the work, and
gross margins converge toward software levels as the AI matures. The displacement is the
massive professional and business process services market.

The moat is the data flywheel: every engagement generates domain-specific labeled data by
internal experts that makes the AI more accurate, faster, and better at edge cases over time.
A horizontal AI tool doesn't have the vertical depth, and an incumbent service provider can't
replicate it without rebuilding from scratch. That compounds with deep workflow integrations
and operational entrenchment. When a customer runs their core processes through the platform,
switching becomes prohibitively painful.

**Use cases:** legal, insurance, accounting, healthcare, fund admin, recruiting, customer
support, mortgage and lending, customs and trade compliance, IT services/modernization, market
research

**Example pipeline companies:** Strala, Pathwork, Watchful, Tessera, Mando, Genera, Conduct,
Nova Intelligence, Isoform, Fractional, Synquery, Greenboard, Echelon

**Reference:** https://www.emcap.com/thoughts/the-ai-native-services-playbook

---

## Theme 7: Hardware supply chain

US hardware development cycles are significantly slower than China: weeks from design to
physical part versus days in Shenzhen, largely due to fragmented supplier networks and poor
coordination between design, manufacturing, and logistics. This creates a bottleneck for the
growing number of hardware startups in robotics, medical devices, defense, and industrial
equipment that depend on fast iteration to compete. Companies building infrastructure to close
that gap create a unique opportunity: faster parts production, software that connects design
tools to manufacturing and fulfillment, and supplier coordination layers.

**Example pipeline companies:** Silkline, Rapidflare, SourcIX, Makat, Continuum

---

## Theme 8: Vertical systems of record built on conversational data

Most systems of record are populated manually, making them incomplete and inaccurate. They
reflect what people chose to enter, not what actually happened. These companies embed into the
conversations where work occurs, use that first-party data to build a system of record and
automate downstream workflows, accumulating a proprietary dataset incumbents can't replicate.
The wedge is a specific vertical where conversations are high-frequency and high-stakes, and
the expansion path is owning more of the workflow that follows.

**Use cases:** legal, insurance, wealth management, healthcare, field sales, mortgage and
lending, recruitment, home services and contractors, trucking and logistics dispatch

**Example pipeline companies:** Hardline, Marloo, Enata

---

## Theme 9: Agentic security infrastructure

Every layer of enterprise security (identity, auth, permissioning, endpoint, network) was built
for humans or static applications. Those don't work for agents: they're non-deterministic,
easily manipulated, spawn ephemerally, and take real actions with real credentials across trust
boundaries. The opportunity is rebuilding security layers for a world where the primary actor
inside an enterprise is an AI agent: credential brokering, agent-scoped identity and access
controls, and governance infrastructure that gives enterprises visibility into what agents are
doing and what they're allowed to do.

**Use cases:** identity access control, secrets management, runtime policy enforcement, audit
trails and activity logging, MCP server security, prompt injection detection, shadow agent
discovery

**Example pipeline companies:** Quilr, PromptArmor, Hydden, Liminal, Mirror Security,
SplitSecure
