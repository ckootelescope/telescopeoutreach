# Round 1 Email 1, Block 2 Spec

Read this file in full on every `/outreach` invocation, before drafting. It replaces the old
four-move structure for Email 1 Block 2 only. Email 4 paragraph 2 and Round 2 Emails 2 and 3
still use the four-move structure in `CLAUDE.md`.

Last rebuilt 2026-10-08 from 137 Round 1 threads where the founder replied to Email 1 and a
contrast set of 48 openers that never got a reply (May 18 to Sep 21, 2026).

## What the data says

| Finding | Evidence |
|:-|:-|
| The 4-move template ("pattern we keep seeing / the ones that stall / I think X is interesting though") was the weakest era | Email 1 reply rate 13% (7 of 52) for Aug 17 to 31, vs 35% pre Jul 29, 25% Jul 29 to Aug 16, 38% Sep |
| Founders reply to feeling understood, not to novelty | 34 of 137 replies quoted Block 2 back. Almost all say some version of "you nailed it", "that's exactly why we started", "you described my thesis to the T" |
| The quoted sentence is always the problem framing, never the expansion claim | Not one founder engaged with "becomes the system of record / operating layer / much more than X tool" |
| Shorter wins | Median Block 2 was 81 words for responders, 102 for non-responders |
| A specific closing question gets answered | Pre Jul 29, about half of Block 2s ended in a question and founders answered it in the reply (Plan0, Platformr, Devplan, Trade Lab, Brick Dynamics, ContextBridge) |
| Credential lead-ins hurt | "I help lead our enterprise AI investing efforts alongside my Principal, Chris (former OpenView partner)" shows up in 13 to 17% of non-responders vs 5% of responders |
| Recent output is templated | Of the last 82 Block 2s, 46% contain "spending a lot/ton of time", 32% "What I like about", 28% "I spend most of my time". The Sep 20 insurance batch opened 7 emails with the identical sentence |
| Founders notice AI copy | One founder wrote back asking Calvin to drop "give away phrases" like "one thing I keep thinking about". Another opened with "If that was an automated message, it's a really good one" |

Caveats. Reply rate is confounded by company mix, timing and the ITC in-person asks in late
September, and the eras are small. The direction is consistent enough to act on. Quality of reply
(engaged vs "not raising, keep in touch") is the better signal for Block 2 than raw rate.

## Goal

One short founder-facing paragraph that states how the market actually works, where it breaks,
and why this company is on the right side of the break. The founder should finish it thinking
"that's exactly how I think about it, and I haven't heard an investor put it that way."

Where this differs from the original draft spec. The original bar was "that's an interesting way
to think about my market." The replies show the stronger lever is recognition. The winning emails
stated the founder's own core bet more sharply than their website does. A clever reframe the
founder disagrees with gets a polite "not raising." Aim for their thesis, sharpened, in words that
are not on their homepage.

## Research (every invocation)

1. Re-read this file, including the gold examples.
2. Start with the official website. Then go where the founder explains *why*, not *what*: launch
   posts, blog, podcast pages, docs, changelog, customer stories, YC or accelerator page. The
   founder's own framing of the problem is the single most useful input.
3. Granola sweep on the market (see `CLAUDE.md`, Market Pattern Insights) for how buying,
   adoption and expansion actually work. Generalize and strip the source.
4. Market sources and press as needed for how incumbents were built and who owns the budget.
5. Treat any thesis or draft Calvin supplies as a hypothesis to test, not the answer.

## Find the break (internal, never shown)

Answer all four before writing a word. If any answer is "I don't know", research more or fail
closed.

1. How the workflow works today, concretely. Who does it, in what tool, how often.
2. Where it breaks. The specific moment it gets expensive, slow, risky or political.
3. Why this company sits at that break. What it does that the incumbent's design cannot.
4. The business consequence. What changes for the buyer, or for how the company grows.

Then generate at least 3 distinct angles and pick the best. Angles that have worked, in rough
order of hit rate.

| Angle | What it sounds like | Worked for |
|:-|:-|:-|
| Incumbent built for a different problem | "Most tools were built for X. Companies that start with Y have a different problem." | Kudwa, CrunchAtlas, DeepIDV, Fortify |
| The real cost is downstream | "The cost isn't the email, it's the audit finding months later." | Compuvi, Trade Lab, Cerulean |
| Pain scales with growth | "It gets worse every time the brokerage adds volume, so growth means adding people." | Handle, Brick Dynamics, Lightswitch |
| Disguised problem | "Speed is really a data problem disguised as a sales problem." | PromptLab |
| Borrowed model from another field | "Bringing the pen testing model to incident response." | Reflex |
| Buyer behavior and adoption | "Practices adopt fastest when nothing changes in the systems staff already use." | QuantumLoopAi, Atonomic |
| Honest tension the company resolves | "Does forward deployed work make the next deployment easier, or not?" | Evos |
| Assumption that breaks with AI | "Scripted tests check a fixed sequence. That stops working once the product isn't deterministic." | Minitap, ThirdLaw, Manifest |
| A concrete scene | "A sofa arrives damaged and the brand runs the claim over email with photos." | Claimlane, Moonlit, Devplan |

Also fair game when the evidence supports it. Switching costs, proprietary context or data, labor
economics, distribution, implementation friction, budget ownership.

## Write it

**Shape.** 2 to 4 sentences, 45 to 95 words. Usually 3.

1. Open on the observation itself. No credential sentence. An earned-position clause is allowed
   only if it is short (12 words or fewer), true, and phrased differently from the last 5 emails.
2. One sentence on the mechanism. Why it breaks, ideally with a concrete scene or the moment it
   gets expensive.
3. One sentence tying the company to the break. Name what the company does, in plain words.
4. Optional. One specific question the founder is uniquely placed to answer, which tests the
   insight. "Whether the trust curve is shorter than you expected" is good. "How you're thinking
   about the US market" is not. The question counts toward the 4 sentences.

**Hard style rules.** No em dashes, en dashes, double hyphens or spaced hyphens used as dashes.
No colons or semicolons. Plain English, conversational, compact, opinionated. Contractions are
fine. Write the way Calvin talks.

**Banned stems.** These are worn out from overuse or read as AI. Do not use them, or close
variants.

- "I spend most of my time across vertical/enterprise AI"
- "We've been spending a lot/ton of time in/around"
- "As thematic investors" / "As part of our thematic work"
- "The pattern we keep seeing" / "The ones that stall"
- "I think [Company] is interesting though because"
- "What I like about [Company] is that"
- "One thing I've noticed / we've learned / I keep thinking about"
- "feels like a much more natural path/way"
- "becomes the system of record / system of action / operating layer"
- "rather than just another [tool / dashboard / point solution]"
- "huge opportunity", "game changer", "table stakes", "the fact that", "is especially compelling"

**Do not add.** Telescope boilerplate (Block 1 has it). Meeting asks (Block 3 has it). Metrics,
funding, headcount, traffic or press quotes as the hook. Platform or system-of-record expansion
claims. Portfolio references as a substitute for insight. A portfolio or team tie-in is allowed as
one trailing clause only when it is real and specific (Skillset's founder replied "appreciate the
IT depth").

## Checks before output

1. **Recent-output check.** Run `node scripts/block2_check.js "<paragraph>"`. It prints rule
   violations and the last 5 Block 2s that went out. Reject the draft if it repeats an opener,
   sentence rhythm, pivot word, closing move or argumentative skeleton from any of them. If the
   database is unreachable, query `step` where `step_no = 1` through the Supabase MCP instead.
2. **Swap test.** Replace the company name with a competitor's. If the paragraph still reads
   true, it is too generic. Rewrite.
3. **Homepage test.** If the founder could find the sentence on their own site, it fails.
4. **"AI makes this better" test.** If the insight reduces to "AI automates the manual thing", it
   fails.
5. **Fail closed.** If public evidence does not support a differentiated insight, do not
   manufacture one. Tell Calvin what is missing and stop. Research grade C still means no draft.

## Output

```
Revised Block 2
[one best paragraph]

Why
[one or two short lines. The angle used and the sentence you expect the founder to quote back.]
```

## Gold examples

Each one got a reply that reacted to Block 2 itself. Lightly edited to the current style rules
(dashes and colons removed, typos fixed). The sentence the founder reacted to is unchanged.

**Kudwa (FP&A). Incumbent built for a different problem.** Positive, meeting.
> The FP&A space is crowded, but I think multi-entity consolidation is the right wedge. Most of
> the platforms out there were built for single-entity companies that grew into needing budgeting
> tools, not for companies that started with multiple entities, currencies and intercompany
> complexity from day one. Those are different problems. I'd be curious whether you see
> multi-entity as the durable differentiator or as a beachhead into broader FP&A.

Founder: "If that was an automated message, it's a really good one... great to see we share the
view that the multi-entity angle is the right wedge."

**CrunchAtlas (network security). Incumbent built for a different problem.** Positive.
> Most network security tools still rely on signatures to catch threats, which means they only
> catch what they've already seen before. I think the opening is behavioral analysis that spots
> anomalies in real time, before anyone has written the signature.

Founder: "What you said about the limitations of signature-based detection is exactly what led us
to start CrunchAtlas in the first place."

**Compuvi (communications compliance). The real cost is downstream.** Positive.
> Regulated companies send thousands of emails a day and compliance teams have no realistic way to
> review them all. A violation usually doesn't surface until an audit or a lawsuit, and by then the
> damage is done. Catching it before it's sent is a different product than reviewing it after.

Founder: "You've framed the problem exactly right. In regulated industries the real cost of a
missed communication isn't the email, it's the audit finding or the lawsuit months later."

**PromptLab (distributor quoting). Disguised problem.** Soft, but quoted back word for word.
> I think quoting is a strong wedge for distributors because pricing, inventory and order history
> live in different systems, so speed is really a data problem disguised as a sales problem. Sitting
> on both sides of the transaction means you see how buyers ask and how sellers respond, which is
> the part nobody else in the deal has.

Founder: "You read the wedge right. Quoting is a data problem wearing a sales problem's clothes."

**Reflex Security (incident response). Borrowed model from another field.** Positive, meeting.
> There's a strange gap between how rigorously companies test their infrastructure and how little
> they test the people and processes that respond to an incident. Reflex is basically bringing the
> pen testing model to incident response, so a team can pressure test cross-functional decisions
> and actually measure whether it's getting better.

Founder: "Liked the way you framed what we're doing, very close to our vision."

**Handle (insurance distribution). Pain scales with growth.** Positive.
> The best wedges on the brokerage side are the ones where the pain gets worse every time the
> brokerage adds volume. Quoting and reconciliation still mean moving between carrier portals and
> spreadsheets, so growth usually means hiring people just to keep up. Automating that is how a
> brokerage grows without the headcount line growing with it.

Founder: "The read on Handle is spot on."

**Evos (operational AI). Honest tension the company resolves.** Positive, booked.
> Forward deployed work is what gets the first customer live in operational AI. The real question
> is whether that work makes the next deployment easier, or whether every customer still needs the
> same custom effort. The prebuilt integration surface makes it look like you're turning
> implementation into product from day one, which is how you keep the flexibility without becoming
> a services business.

Founder: "Really appreciate the thoughtful note on our product strategy."

**Atonomic (warehouse automation). Buyer behavior.** Positive, booked same day.
> Warehouse automation has split between giant end-to-end projects only the largest operators can
> absorb and point robots that are easy to buy but leave the team stitching the system together.
> The next wave looks like brownfield operators fixing one throughput bottleneck at a time without
> becoming their own systems integrator. If the first workflow feels like buying a throughput
> outcome rather than an automation project, expanding across the facility gets much easier.

Founder: "You described my thesis to the T. I'd love to share notes."

**Minitap (QA testing). Assumption that breaks with AI.** Soft, quoted.
> Scripted end-to-end tests start to break once the product itself gets more dynamic, because the
> test is still checking whether a fixed sequence happened exactly as written. Judging whether the
> user actually got the job done is a better way to test software that isn't fully deterministic.

Founder: "Spot on!"

**Devplan (product ops). Concrete scene plus a question.** Positive.
> Coordination overhead is so embedded in how software teams work that most people have stopped
> noticing it. The number of status meetings, Slack threads and Jira updates that exist only so a
> product leader can figure out what's happening is wild. I'd be curious whether there's a moment
> when teams see it working and realize how much time they'd been spending just staying informed.

Founder: "That realization moment you mentioned is definitely real."

**Claimlane (warranty claims). Concrete scene.** Positive.
> Warranty claims for physical goods are weirdly unsolved. A customer's sofa arrives damaged and the
> brand ends up running the whole claim over email, with photos going back and forth and no system
> behind it. I'd be curious whether the US is a priority yet or whether you're going deeper in
> Europe first.

Founder answered the question directly ("about 40% of our new pipeline from the US") and moved
to scheduling.

## Anti-examples (no reply)

**Mendo.** 92 words, two separate theses, ends on a platform claim nobody engages with.
> I spend most of my time across enterprise AI and came across Mendo as part of our market work.
> One thing we've been trying to understand is adoption... Mendo can become the system that tells
> an enterprise where to place its next AI dollar, not just whether people completed the training.

Rewrite to spec, same facts.
> Enterprises can now build agents far faster than employees change how they work, so the
> bottleneck has moved from building agents to knowing which ones people keep using. Sitting inside
> Copilot and ChatGPT means Mendo sees which workflows keep coming back before anyone decides what
> to build next.

**Lightswitch.** Good insight buried under a stock opener and a long tail.
> I spend most of my time across vertical AI and have been spending a lot of time within CPG as part
> of that work. I think CPG brands can win distribution faster than their back office can absorb
> it...

Rewrite to spec.
> CPG brands can win distribution faster than their back office can absorb it, since every new
> retailer shows up with its own order formats, portals and routing rules. Working across the
> systems a brand already has means a lean ops team can keep saying yes to retailers without hiring
> a coordinator for each one.

**Vimes.** Founder story and mission praise instead of a market view. Founders get this from
every fund.

**Deduction.** "I think the value-prop is pretty obvious" concedes there is no insight.

**Hamlet / Graphon / Lemrock.** Credential sentence first ("I help lead our enterprise AI
investing efforts alongside my Principal, Chris"), then a generic defensibility claim
("defensible dataset", "more fundamental to the AI stack").

**Sep 20 insurance batch.** Seven emails opened with "I spend most of my time across vertical AI
and have been spending a ton of time in insurance these days." Each paragraph was decent alone.
Side by side they read as a mail merge, which is how founders who talk to each other see them.
