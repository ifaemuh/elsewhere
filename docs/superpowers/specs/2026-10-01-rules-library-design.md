# Track A — Rules Library and Refresh Engine

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review
**Program:** [`2026-10-01-elsewhere-restart-program.md`](2026-10-01-elsewhere-restart-program.md)

## Goal

Build one versioned library of travel rules, rights, and hidden perks. Every claim in the
library is quoted word-for-word from a primary source, and the library keeps itself
current when those sources change.

Four consumers read it:

| Consumer | Uses |
|---|---|
| Content engine (track B, foundry) | Verified rules become carousels and reels |
| Web app (track C) | Public rule pages, plus Assist's disruption and document matching |
| Rules API + MCP (track D) | AI agents and partners query rules |
| Founder | Reviews and approves every new or changed rule in a GitHub PR |

Success: 30 rules verified, each with passing quote checks, and a refresh loop that has
caught at least one real or planted source change end-to-end.

## Non-goals

- Legal advice. Every surface says what the rule says and links the source.
- Blogs, news articles, or forums as sources. They can prompt research, never back a
  claim.
- Scraping behind logins, paywalls, or CAPTCHAs.
- Countries beyond what US-based travelers commonly hit. That means US federal rules,
  EU261, UK261, the top US airlines, and entry rules for common destinations.

## Where it lives

A new workspace package in the elsewhere monorepo:

```
packages/rules/
  data/
    flights/<rule-id>.yaml
    documents/<rule-id>.yaml
    money/<rule-id>.yaml
    hotels/<rule-id>.yaml
  sources.yaml            # every tracked source and its Open Terms Archive mapping
  src/
    schema.ts             # zod schema for a rule file
    facts.ts              # the closed vocabulary of facts conditions may test
    match.ts              # evaluate applies_when against a situation
    load.ts               # load + validate all rules; emit dist/rules.json
    check-quotes.ts       # verify every quote against current source text
  test/
  package.json            # name: @elsewhere/rules
```

`npm run rules:build` validates everything and writes `dist/rules.json`. The web app
imports the package directly. Foundry reads the same JSON either from a local checkout
(`RULES_SOURCE=path:<dir>`) or from the deployed web app
(`RULES_SOURCE=url:https://<app>/api/rules.json`).

`dist/rules.json` contains:

| Field | Meaning |
|---|---|
| `schema_version` | Integer. Bumps only on a breaking change to the rule projection or envelope |
| `library_version` | Build date plus a short content hash of the rules, e.g. `2026-10-06.a1b2c3d`. Consumers cache and ETag on it |
| `rules` | Every rule with its status |
| `changes` | One entry per rule version bump or status change, derived from git history of `data/`: rule ID, from/to version, from/to status, and date |

The golden match fixtures live in `packages/rules/test/fixtures/match/`. Track A's
matcher tests and track D's `POST /api/rules/match` tests run the same files, so the
API cannot drift from the matcher.

## Rule file format

One YAML file per rule. The ID is stable for the rule's life, and `version` increments on
every substantive change. Git history is the audit trail.

```yaml
id: us-dot-refund-cancelled-flight
version: 1
status: verified            # draft | verified | needs_review | retired
domain: flights             # flights | documents | money | hotels
jurisdiction: US-DOT        # US-DOT | US-FTC | US-TSA | US-STATE | EU-261 | UK-261 | carrier:<IATA> | issuer:<name> | country:<ISO>
title: "Cancelled flight? You're owed cash, not a voucher"
summary: >-
  If a US airline cancels your flight and you don't take the rebooking, it must refund
  your original payment method. A voucher only counts if you accept it.
applies_when:
  all:
    - fact: event.type
      in: [cancellation]
    - fact: flight.touches_us
      eq: true
    - fact: passenger.accepted_alternative
      eq: false
entitlement:
  kind: refund               # refund | compensation | care | rebooking | requirement | perk | protection
  amount: { basis: full_ticket_price, payment: original_method }
  timing: "7 business days for card purchases"
how_to_claim:
  steps:
    - "Decline the rebooking or travel credit if you don't want it."
    - "Request a refund to your original payment method in writing."
  templates: [airline_refund_request]
exceptions:
  - "Does not apply if you accept the alternative flight or a voucher."
sources:
  - id: s1
    source: ecfr-14-cfr-260           # key into sources.yaml
    quotes:
      - text: "<exact text copied from the source>"
        supports: [summary, entitlement.amount]
lead_character: pigeon               # capybara | owl | raccoon | pigeon (guests added later)
tags: [cancellation, refund, us]
last_verified: 2026-10-06
verified_by: ifaemuh
review_by: 2027-01-04                # last_verified + 90 days
```

The quote text above is a placeholder in this illustration only. Real rule files carry
real quotes, and the quote check rejects anything else.

### Facts vocabulary (`facts.ts`)

`applies_when` may only reference facts from a closed, typed list. Each fact has a name,
a type, and a description. Adding a fact is a reviewed PR, which keeps matching
deterministic and stops AI-drafted rules from inventing conditions.

The initial set:

| Group | Facts |
|---|---|
| Event | `event.type` (cancellation, delay, schedule_change, denied_boarding, downgrade, missed_connection, tarmac_delay, bag_delayed, bag_lost, bag_damaged, service_not_provided) · `event.delay_minutes` · `event.notice_days` · `event.cause` (controllable, uncontrollable, unknown) |
| Flight | `flight.carrier_iata` · `flight.carrier_is_us` · `flight.touches_us` · `flight.is_domestic_us` · `flight.departs_eu` · `flight.arrives_eu` · `flight.carrier_is_eu` · `flight.departs_uk` · `flight.distance_km` · `flight.single_ticket` |
| Passenger | `passenger.accepted_alternative` · `passenger.nationality` · `passenger.passport_months_valid_after_return` · `passenger.has_real_id` · `passenger.payment_card_issuer` |
| Trip | `trip.destination_country` · `trip.booked_via` (direct, ota) · `trip.hours_since_booking` · `trip.days_until_departure` |
| Lodging | `lodging.kind` (hotel, short_term_rental) · `lodging.booked_via` |

`match.ts` evaluates `all` / `any` groups with the operators `eq`, `in`, `gte`, `lte`,
`gt`, `lt`, and `exists`. A fact the caller doesn't supply evaluates to **unknown**, not
false. The match result says "may apply, needs X" so Assist can ask the planner, and
nothing is silently dropped.

## Sources (`sources.yaml`)

Each source has a key, a URL, a kind, and the detector that watches it.

```yaml
delta-contract-of-carriage:
  url: https://www.delta.com/us/en/legal/contract-of-carriage-dgr
  kind: contract_of_carriage   # regulation | agency_guidance | government_page | contract_of_carriage | customer_service_plan | issuer_benefit_guide
  detector: { ota: { service: "Delta Air Lines", terms_type: "Conditions of Carriage" } }

ecfr-14-cfr-260:
  url: https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-260
  kind: regulation
  detector: { ecfr: { title: 14, part: 260 } }
```

Detectors are `ota`, `ecfr` (the eCFR versioning API), or `changedetection`. The first
implementation step below decides whether government pages go on `ota` or
`changedetection`.

**Initial source set:**
- **US regulations:** eCFR 14 CFR Parts 250 (oversales), 254 (baggage liability), 259
  (tarmac delay and customer service), 260 (refunds), and 399.
- **US agency guidance:** DOT aviation consumer protection pages, and the DOT Airline
  Customer Service Dashboard (FlightRights.gov).
- **EU and UK:** Regulation (EC) 261/2004 on EUR-Lex, and the UK261 guidance from the
  UK Civil Aviation Authority.
- **Entry and documents:** State Department passport and country pages, TSA REAL ID,
  CBP, the EU's ETIAS and EES pages, and the UK ETA on gov.uk.
- **Airline commitments:** contracts of carriage and customer service plans for AA, DL,
  UA, WN, AS, B6, NK, F9, G4, and HA.
- **Money and lodging:** FTC junk-fee rule pages (lodging all-in pricing), and card
  issuer benefit guides for the money rules.

## Initial backlog: 30 rules

These are candidate titles, with the mix set in the program spec. During research, an
item that can't be backed by a primary source is replaced, not weakened.

**Flights (12):**
1. Cancelled flight → cash refund if you decline the alternative
2. Significant schedule change or delay → refund
3. 24-hour free cancellation or hold
4. Involuntary bumping compensation amounts
5. Tarmac delay limits and food and water
6. What each airline commits to for controllable delays (meals, hotel)
7. Bag fee refund when bags are significantly delayed
8. Refunds for paid services not provided (seats, Wi-Fi)
9. EU261 delay compensation by distance
10. EU261 cancellation with short notice
11. EU261 right to care, even in extraordinary circumstances
12. Missed connection on one ticket → airline rebooks you

**Documents (6):**
13. Passport validity rules by destination
14. REAL ID for domestic flights
15. ETIAS for Europe (status and start date confirmed in research)
16. UK ETA
17. EU Entry/Exit System registration
18. Passport card vs passport book for international air travel

**Money and perks (6):**
19. Card trip-delay coverage
20. Card trip cancellation and interruption coverage
21. Fare drop after booking → credit for the difference
22. Airline travel credit expiration
23. Chargeback rights for undelivered travel services
24. What basic economy takes away

**Hotels and booking (6):**
25. Lodging all-in pricing (the junk-fee rule)
26. What happens when a hotel overbooks ("walked"), per brand policy
27. Free cancellation deadlines when booking through an OTA vs direct
28. Short-term rental rebooking or refund when the listing isn't as described
29. Booked through an OTA: who has to fix a schedule change
30. Rental car coverage from your card (primary vs secondary)

## Research workflow (new rules)

1. **Draft.** A worker agent (Codex, per the CLAUDE.md routing) takes a backlog item,
   reads only the primary sources in `sources.yaml` (adding a source to that file is part
   of the same PR), and writes the YAML with exact quotes. Status is `draft`.
2. **Check.** CI runs `rules:build` (schema) and `rules:check-quotes`. Each quote must
   appear in the source's current text, compared after whitespace and Unicode
   normalization. Every field listed under any quote's `supports` must be covered, and
   `summary` and `entitlement` must each be supported by at least one quote.
3. **Approve.** The founder reviews the PR, which takes about two minutes per rule. On
   merge, a follow-up commit sets `status: verified`, `last_verified`, `verified_by`, and
   `review_by`. The merge commit is the verification record.

## Refresh engine

Detection is deterministic. Interpretation is done by the Dot. A deterministic backstop
catches anything the Dot misses.

```
sources.yaml ──► Open Terms Archive (GitHub Action, daily)
                    │ new version committed to elsewhere-sources-versions
                    ▼
             OpenAI Dot (watches the versions repo)
                    │ reads diff + affected rules
                    ▼
        PR on elsewhere: rules/refresh-<source>-<date>
        (rule updated, status: needs_review)
                    │ CI: rules:build + rules:check-quotes
                    ▼
             Founder approves → verified again

Nightly backstop: rules:check-quotes against latest versions.
Any quote no longer found verbatim → bot PR flips that rule to needs_review.
```

### Detection: Open Terms Archive

- **Repos:** three new repos following the OTA collection convention:
  `elsewhere-sources-declarations`, `elsewhere-sources-versions`, and
  `elsewhere-sources-snapshots`. Declarations are generated from the `ota` entries in
  `sources.yaml` by a script, so `sources.yaml` stays the single list.
- **Schedule:** a GitHub Action runs `ota track` daily.
- **First implementation step, verified before building on it:** OTA validates terms
  types against its `terms-types` list. Confirm that regulations and government pages
  can be declared under an existing type such as "Conditions of Carriage" or a generic
  one. If they can't, those sources use **changedetection.io** with the same "commit a
  version to git" output. Airline contracts of carriage stay on OTA either way, since its
  French collection already tracks them.
- **eCFR:** regulations use the `ecfr` detector. The same daily Action calls eCFR's
  versioning API and commits a new version file to `elsewhere-sources-versions` whenever
  Title 14 amendment dates change, so the Dot sees one stream of versions regardless of
  detector.

### Interpretation: the OpenAI Dot

The founder has ChatGPT Pro. One Dot, named "Rules Keeper," is configured with:

- **Connectors:** GitHub, read on `elsewhere-sources-versions` and read/write on elsewhere
  limited to `rules/refresh-*` branches.
- **Goal prompt** (stored in the repo at `packages/rules/dot/goal.md` so it is versioned).
  For each new source version:
  1. Find the rules that cite the source.
  2. Read the diff.
  3. Classify the change as no-impact, quote-moved, or substantive.
  4. For quote-moved, update the quote text.
  5. For substantive, update the rule, set `needs_review`, and explain in the PR body.
  6. Never edit `verified_by` or `last_verified`.
- **Custom Rules:**
  - **Allow:** open PRs on `rules/refresh-*` branches, and comment on its own PRs.
  - **Require approval:** anything touching `sources.yaml`.
  - **Prohibit:** merging, pushing to `main`, and any repo other than these two.
- **Weekly Federal Register watch:** query the Federal Register API for DOT aviation
  consumer rulemakings and open an issue summarizing anything proposed or final that
  touches a rule's jurisdiction.

**Acceptance test before trusting it:** add a page we control (a GitHub Pages file) to
`sources.yaml`, cite it from a test rule, change one sentence, and confirm the Dot opens
a correct PR. The nightly backstop must also flip the rule if the Dot is paused.

### Staleness

A weekly Action opens one issue listing rules whose `review_by` falls within 14 days.
Re-verification follows the normal draft → check → approve flow.

## Status contract for consumers

| Status | Content engine | Web rule page | Assist | API/MCP |
|---|---|---|---|---|
| `verified` | may use | shown | may cite | returned |
| `needs_review` | pulled from queue; published posts flagged | shown with a "being re-checked since DATE" banner | not cited | returned with status |
| `draft` | not used | not shown | not cited | not returned |
| `retired` | not used | redirects to replacement or shows "no longer applies" | not cited | returned as retired |

## Error handling

- **A source is unreachable** (OTA fetch fails three days running): open an issue. The
  rule keeps its status, since an outage isn't a change.
- **A source is restructured** (snapshot changes but its filter extracts nothing): open
  an issue to update the declaration filter. Its rules move to `needs_review` until the
  declaration is fixed.
- **Bad Dot output** (a PR that fails CI): it can't merge. Repeated failures appear in
  the Dot's activity view for the founder.
- **Conflicting sources** (e.g., an airline plan vs DOT regulation): keep both as
  separate rules with separate jurisdictions. Assist shows the more generous one and
  cites both.

## Testing

- **Schema:** valid and invalid fixture rules.
- **Facts:** every `applies_when` in `data/` references only known facts, with the right
  value types.
- **Matcher:** table-driven cases, including unknown-fact behavior. The old
  `apps/api/lib/assist/mock-trip-guides.ts` scenarios are ported as fixtures.
- **Quote check:** fixture source texts with exact, whitespace-variant, and missing
  quotes.
- **End-to-end:** the planted-change acceptance test above.

## Deliverables

1. `packages/rules` with schema, facts, matcher, loader, quote checker, and tests.
2. `sources.yaml` with the initial source set, and the three OTA collection repos running
   daily.
3. The Dot configured, with its goal prompt in the repo and the acceptance test passed.
4. The first 10 rules verified within the first week (the flight-heavy ones the first
   posts need), and all 30 verified after that.
