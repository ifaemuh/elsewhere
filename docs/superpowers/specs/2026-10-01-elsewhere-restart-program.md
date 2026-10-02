# Elsewhere Restart — Program Overview

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review
**Supersedes:** the app-shelving parts of `2026-09-04-travel-content-engine-design.md` and the
mobile-first direction in `docs/PRODUCT_BRIEF.md`. Both carry a banner pointing here.

## Thesis

Elsewhere is **group-trip Assist run by the planner**: the person who organizes the friend
trip, the couple trip, or the birthday weekend gets warned before things go wrong and is
told exactly what to do when they do, for the whole group at once.

Three things make it defensible, and the program is built around them:

1. **The group, not the individual.** Every competitor works per traveler and per booking.
   Nobody handles "the trip broke for six people across four bookings."
2. **The audience.** A cartoon cast on @go.elsewhere explains travel rules people don't
   know. Distribution is content people save and send, not ads.
3. **The verified rules library.** One source of truth, cited word-for-word from primary
   sources, kept current automatically. It feeds posts, public rule pages, Assist, and
   AI agents.

It is a **web app**, not native. A link dropped in a group chat opens with no install,
and group members keep using Messages, WhatsApp, and Photos. Elsewhere sends them links
and texts and never asks them to move their conversation.

**Leverage the platforms, don't fight them.** TikTok and Instagram are the distribution
layer. AI agents (OpenAI Dots, Gemini Spark, Claude) are a channel for the rules library,
not only competitors.

## Why the reframe (audit, 2026-10-01)

Single-traveler disruption help is not unique. Flighty Pro ($60/yr) predicts delays up
to six hours ahead. TripIt Pro ($49/yr) alerts and finds alternate flights. AirHelp files
claims for 35%. Gemini Spark watches Gmail for trips, and OpenAI Dots can be told to
watch a flight. What none of them serve is the planner's group-shaped problem: six
passports to check before the trip, and six people to rebook, notify, and settle up with
afterward.

Risks accepted with eyes open:

- **Low frequency.** A traveler hits a real disruption once or twice a year. The content
  account keeps people warm between trips.
- **US rights are thinner than EU rights.** The US gives refunds and the airline's own
  commitments, not cash compensation for delays. A success fee earns little in the US.
- **Willingness to pay is unproven** for a 2–4-trips-a-year planner. The payment test
  below measures it alongside the build rather than gating it.

## Audience

- **Paying user:** the trip planner. They book everything themselves, have no elite
  status and no corporate travel desk, take 2–4 trips a year, and fix things for everyone
  when they break.
- **Content reach:** leisure travelers, roughly 22–45, skewing toward people who save
  and share. Planner-specific posts are a recurring series, not every post.
- **Not targeted now:** business road warriors, luxury travelers, most travelers over 55.
  Each already has someone to call.
- **Verification:** after 20–30 posts, compare Instagram audience insights against this
  picture, then adjust.

## Brand and content decisions

- **Account:** the cast takes over `@go.elsewhere` (TikTok + Instagram). City tips
  continue as one series and can still carry TikTok GO place tags. The bio moves from
  "city guides" toward "travel, explained."
- **Cast:** a mixed-animal friend group. Each is a traveler type, told apart by outline:
  - **Capybara** (he): the unbothered one, and the account's face.
  - **Owl** (she): the planner. This is our paying user.
  - **Raccoon** (she): the chaos one.
  - **Pigeon** (he): the deal hunter.

  Guests (kangaroo parent, squirrel points hoarder, lamb first-timer, snail over-packer)
  are introduced once the core cast is recognizable. Saves and shares decide who becomes
  a regular.
- **Lead character per post, chosen by topic:**
  - **Raccoon:** it already went wrong.
  - **Owl:** rules and deadlines.
  - **Pigeon:** money owed and perks.
  - **Capybara:** the calm fix.
- **Art style "A++":** kawaii/chibi cozy illustration. Big glossy eyes, bold clean
  outlines, flat muted sage, olive, cream, and peach. Close to the reference account's
  charm, kept distinct by species, palette, and typography. Approved mockups live in
  `.superpowers/brainstorm/` (gitignored).
- **Text is never drawn by the image model.** Templates set all type. The model draws
  characters and scenes only.
- **Formats:** carousels and narrated reels from day one, built from the same rule.
- **Voice:** an A/B test. Narrator-only is the default. A share of reels add one character
  one-liner.
- **First 30 posts:** about 12 flights, 6 documents, 6 money and perks, and 6 hotels and
  booking. Rules are written for US-based travelers, covering domestic trips plus common
  international ones, including EU261.

## Feature sort (from the old Elsewhere build)

| Verdict | Features |
|---|---|
| **Core** | Trip intake, travelers, travel admin (passport/PreCheck/Global Entry: official free routes with deadline math, plus an expedited-passport affiliate; GovSwift partnership deferred), action items, votes, schedule + participation, payments summary (settled via Venmo/Cash App links), travel credits as assets, notifications |
| **Reshaped** | In-app chat becomes links into existing chats. The Discover feed is dropped, but `discover/enrich` stays to turn a pasted TikTok link into a place. Calendar becomes an .ics export. The photo recap reel arrives later, built from photos people pick |
| **Parked** | Booking checkout and package generator, financing/BNPL, social graph, AI selfie previews. The previews return later as "turn your friend group into the cast" |

## Program: four tracks, run in parallel

| Track | Spec | Repo | Depends on |
|---|---|---|---|
| **A. Rules library + refresh** | [`2026-10-01-rules-library-design.md`](2026-10-01-rules-library-design.md) | elsewhere | nothing; it is the foundation |
| **B. Content engine** | `docs/superpowers/specs/2026-10-01-elsewhere-content-engine-design.md` | foundry | A's first verified rules |
| **C. Group-trip web app** | [`2026-10-01-group-trip-web-app-design.md`](2026-10-01-group-trip-web-app-design.md) | elsewhere | A |
| **D. Rules API + MCP** | [`2026-10-01-rules-api-mcp-design.md`](2026-10-01-rules-api-mcp-design.md) | elsewhere | A |

A ships its first rules within days, so B, C, and D start immediately against the first
verified rules rather than waiting for all 30. Each track gets its own implementation
plan.

**Foundry is the home for all social media and marketing**, meaning content, publishing,
growth automations, and performance tracking. Public rule pages live in the elsewhere web
app because they are product.

## The payment test (runs inside track C, alongside the build)

Every public rule page ends in a real offer: *"Forward your group's bookings and we'll
watch the trip — $X."* Checkout runs on Stripe. Two price points are tested. In parallel,
the founder and the Dot watch 10–20 real follower trips by hand.

| Signal | Bar to call it working |
|---|---|
| Rule-page visitors who forward at least one booking | ≥ 3% |
| Forwarders who pay | Any paid conversions at either price, with the stronger price chosen for launch |
| Hand-watched trips with an actionable event | Logged per trip, used to size the disruption rate |

The test informs pricing and feature priority. It does not block the build.

## Execution model

Per the CLAUDE.md routing, the premium model plans, makes risky calls, and does final
review. Codex and subagents do the coding loop in isolated worktrees. The OpenAI Dot (the
founder has ChatGPT Pro) runs rules refresh. Tracks are staffed in parallel, and no track
is cut for bandwidth.

## Open items for the founder

1. **Uncommitted mobile work on `codex/discover-reels-glass`.** Before Expo is archived,
   decide whether to commit it as a final snapshot or discard it.
2. **GovSwift (Mischa works there): partnership deferred** (decided 2026-10-01). Travel
   admin ships with official routes and an expedited-passport affiliate. Revisit GovSwift
   for referral terms and application-status callbacks once the core is live.
3. **Price points** for the payment test (proposed in the track C spec).
4. **OpenAI API key** in `apps/api/.env` is out of credits. Image generation now runs on
   Replicate, so top it up only if an OpenAI model is needed.
