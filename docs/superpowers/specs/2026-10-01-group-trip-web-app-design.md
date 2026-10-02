# Track C — Group-Trip Web App

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review
**Program:** [`2026-10-01-elsewhere-restart-program.md`](2026-10-01-elsewhere-restart-program.md)
**Depends on:** [`2026-10-01-rules-library-design.md`](2026-10-01-rules-library-design.md) (`@elsewhere/rules`)

## Goal

The planner forwards the group's bookings and drops one link in the group chat. From then
on, Elsewhere:

- checks everyone's documents before the trip,
- watches every flight,
- tells only the affected people what they're owed and what to do, with every claim cited
  to a verified rule,
- runs the group's decision as a vote,
- turns the new costs into who-owes-what.

Nobody installs anything.

The same app serves the public rule pages that carry the payment test, and the affiliate
pages for the money sub-series.

Success for v1:
- A real forwarded itinerary for a six-person trip is parsed, joined, document-checked,
  and monitored.
- A replayed cancellation produces a cited playbook and a vote, delivered by SMS and email
  to the affected members only.
- The payment test is live, with both price variants taking real Stripe payments.

## Non-goals

- **Booking, rebooking, or filing claims on the traveler's behalf.** We draft the
  message; they send it. Copy says "we drafted," never "we filed."
- **Our own group chat or photo album.** Members stay in Messages, WhatsApp, and Photos.
- **Storing passport numbers, dates of birth, or loyalty credentials.**
- **Fare shopping and price-drop detection.** These need a shopping API and are v2.
- **A native app.**

## Stack

Versions were checked with `npm view` on 2026-10-01.

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3 (App Router, Cache Components), React 19.3 |
| UI | Tailwind CSS 4.3, shadcn/ui (new-york, carried over from `apps/web`) |
| AI | AI SDK 7 through Vercel AI Gateway (`@ai-sdk/gateway` 4.0). Extraction on `anthropic/claude-haiku-4-5`; playbooks on `anthropic/claude-sonnet-5-5`; vision for screenshots |
| Durable jobs | Vercel Workflow SDK 5 (`workflow`): `"use workflow"` / `"use step"`, `sleep`, hooks resumed with `resumeHook` |
| Data + auth | Supabase (existing project `xiinobmygdfwkpjtqauo`): Postgres with RLS, Auth phone/email OTP, Storage |
| Rules | `@elsewhere/rules` (track A): `match()`, statuses, `dist/rules.json` |
| Inbound + outbound email | Resend: receiving domain with `email.received` webhook, plus sending |
| SMS | Twilio Messaging Service (`twilio` 6.1) |
| Flight status | FlightAware AeroAPI: alerts (`PUT /alerts/endpoint`, `POST /alerts` with `target_url`) plus `GET /flights/{ident}` polling |
| Payments | Stripe Checkout (`stripe` 23.0) |
| Calendar (v2) | `ics` 3.12 |
| Validation | zod 4.6 |
| Tests | Vitest, Playwright 1.63 |
| Hosting | Vercel |

**Why Resend for inbound.** Postmark also parses inbound mail well; its `MailboxHash`
plus-addressing would work. Resend is chosen for three reasons:

- It handles inbound and outbound in one vendor.
- It routes `<anything>@<receiving-domain>`, which gives every trip its own address
  without plus-addressing.
- It stores received mail even when the webhook endpoint is down, so an outage loses
  nothing.

Its webhook carries attachment metadata only, so the intake step fetches attachments
through the API.

## Repo restructure (replace, don't layer)

`apps/web` and `apps/api` merge into one Next.js 16.3 app at `apps/web`. `apps/api` is
deleted once its surviving logic has moved. The `/api/v1/*` rewrite and the separate API
port (3002) go away.

**Mobile is archived, not kept alongside:**
1. Tag the last commit that contains it, `archive/mobile-expo-2026-10`.
2. Delete `apps/mobile` in the restructure commit.
3. The legacy Swift files at the repo root are gitignored. The untracked `elsewhere/`
   directory (a SwiftUI prototype) is not gitignored. Neither is part of this change, and
   the founder decides separately whether to delete the prototype.
4. The founder decides, before the tag is cut, whether the uncommitted mobile work on
   `codex/discover-reels-glass` is committed as a final snapshot or discarded. The tag
   preserves whatever is committed at that point.

`packages/shared` folds into `apps/web/lib/types`, because the merged app is its only
consumer, and the package is deleted. `packages/rules` stays a package because track B
(foundry) and track D read it too.

### What happens to existing code

| Existing | Decision |
|---|---|
| `trips/[id]/votes`, `action-items`, `payments/summary`, `notifications`, `schedule/[itemId]/participation` (served by `lib/trips/mock-trip-room.ts`, 1,045 lines) | **Contracts reused**: `TripVote`, `TripActionItem`, `TripPaymentSummary`, `TripNotification`, `TripParticipationStatus` move to `lib/types`. Handlers are rewritten as server actions on Supabase. The mock store is deleted after its scenarios become fixtures |
| `trips/intake` (keyword parser over 12 hard-coded cities) | **Replaced** by email and screenshot LLM extraction |
| `trips/quote`, `checkout-session`, `confirm`; `lib/engines/booking.ts`, `wallet.ts`; `financing/*`; `lib/providers/financing.ts`; `webhooks/financing` | **Deleted** (booking and financing are parked) |
| `lib/assist/mock-trip-guides.ts` | **Becomes test fixtures** (situation → expected rule IDs) |
| `lib/assist/travel-intel.ts`, `live-intelligence.ts`, `assist/*` routes, `webhooks/assist`, `lib/engines/policy.ts`, `action.ts` | **Deleted**. Matching moves to `@elsewhere/rules`, playbooks to `lib/assist/playbook.ts`, and AeroAPI delivery to `/api/webhooks/aeroapi`. The deal radar is parked |
| `discover/*`, `lib/discover/content-intelligence.ts` (2,186 lines), `music-providers.ts` | **Feed deleted.** The `importSocialLink` request/result contract and its source-labeling are kept for v2 link → place. Its internals are a demo stub (fixed demo image) and are rewritten |
| `social/*`, `lib/social/mock-social.ts`, `preview-jobs`, `preview-videos`, `reference-photos`, `local-assets`, `lib/ai/*` | **Deleted.** Previews are parked, and image generation lives in foundry |
| `lib/supabase/*`, `lib/storage/*`, `lib/utils/errors.ts`, `feature-flags.ts`, `apps/web/components/ui`, the `login` page | **Reused** |

## Data model

The existing migrations stay as history. One new migration,
`00012_group_trip_assist.sql`, restructures the schema. The project holds seed data only,
so nothing user-owned is lost.

**Dropped (code removed above):**
- `trip_quotes`, `trip_room_messages`
- all five `financing_*`/`wallet_*` tables
- `assist_disruption_events`, `assist_policy_rules`, `assist_incidents`,
  `assist_timeline`, `assist_action_recommendations` (rules now live in git)
- `travel_admin_applications`
- `preview_jobs`, `reference_photos`, and their join table
- `branded_destination_packs`, `support_override_actions`
- `consent_audit_entries` (preview-specific columns)
- `destinations`

**Kept and changed:**

| Table | Change |
|---|---|
| `profiles` | Drop `is_auto_rebook_enabled`, `is_credit_protection_enabled`, `is_calendar_connected`. Add `phone` (E.164), `sms_opt_in`, `venmo_username`, `cashtag` |
| `trips` | Drop `destination_id`, `traveler_count`, `total_cost`, all `booking_flow_*`. Add `name` (`Place Year`), `inbound_code` (unique, random), `join_token_hash`, `pass_status` (`none`, `active`, `comp`) |
| `travelers` → `trip_members` | Renamed. Adds `role` (`planner`, `member`), `display_name`, `invite_state`, `joined_at`. `payment_state` moves to expenses |
| `travel_document_records` → `member_documents` | Drop `encrypted_reference`; we never hold document numbers. Columns: `user_id`, `kind` (`passport`, `real_id`, `global_entry`, `tsa_precheck`), `issuing_country`, `expires_on`. Owner-only RLS |
| `travel_admin_partner_routes` | Kept as-is for the passport, Global Entry, and PreCheck referral (GovSwift-style partner) |
| `experiment_assignments`, `funnel_telemetry_events`, `attribution_touchpoints` | Kept for the payment test. Add `anonymous_id` so visitors are tracked before sign-in |

**New:**

| Table | Purpose |
|---|---|
| `inbound_messages` | One row per forwarded email or screenshot: sender, subject, `storage_path` of the raw file, `status` (`parsed`, `needs_confirmation`, `quarantined`, `failed`) |
| `bookings` | `kind` (flight, hotel, rental, car, rail, activity), provider, `confirmation_code`, `booked_via` (direct or OTA name), `extraction_confidence`, `confirmed_at` |
| `booking_segments` | Flight legs: carrier IATA, flight number, origin, destination, scheduled times, `fa_flight_id`, `aeroapi_alert_id` |
| `booking_members` | Which members are on which booking. This decides who is affected |
| `document_checks` | Per member and trip: `rule_id`, `result` (`ok`, `action_needed`, `unknown`), plain-language `detail` that never contains the document date |
| `incidents` | Detected event, segment, `event_type`, raw payload, affected member IDs, `status` (`open`, `needs_answer`, `playbook_ready`, `resolved`) |
| `incident_events` | Timeline: detected, question asked, answered, playbook generated, notified |
| `playbooks` | Structured output, `rules_cited` (rule ID + version), model, `citation_check_passed` |
| `action_items` | Shape of `TripActionItem`; source is a document check, incident, or confirmation |
| `votes`, `vote_options`, `vote_responses` | Shape of `TripVote` |
| `expenses` | Payer, amount, currency, description, split (equal or per-member) |
| `notifications` | Channel (`sms`, `email`), template, provider message ID, delivery status |
| `consents` | `user_id`, `kind` (`sms`, `email`, `documents`), `policy_version`, `granted_at`, `revoked_at` |
| `passes` | `trip_id`, Stripe Checkout session, `price_variant`, amount, `status`, `paid_at` |
| `credits` (v2) | Carrier, amount, `expires_on`, source message |
| `places` (v2) | `source_url`, name, coordinates, from link → place |

**RLS:** two `security definer` helpers, `is_trip_member(trip_id)` and
`is_trip_planner(trip_id)`, gate every trip-scoped table.
- **Members** read their trip's bookings, but only see the confirmation codes for bookings
  they are on.
- **Planners** see everyone's `document_checks.result` and `detail`, never
  `member_documents` itself.
- **The service role** is used only in webhooks and workflows.

## Routes and pages

| Path | Kind | Purpose |
|---|---|---|
| `/` | public | Landing page |
| `/rules`, `/rules/[id]` | public, prerendered from `dist/rules.json` | One page per verified or `needs_review` rule. The banner "Being re-checked since DATE" appears on `needs_review`. The page ends in the offer |
| `/money/[slug]` | public | Affiliate pages for the money sub-series |
| `/r/[postId]` | public | Post link from track B (`?p=<platform>`). Records an `attribution_touchpoints` row keyed by `postId` and the visitor's `anonymous_id`, then redirects to the post's rule page with UTM tags |
| `/start` | public → auth | Offer flow: OTP, create trip, show forwarding address |
| `/join/[token]` | public → auth | Group join |
| `/trips`, `/trips/[id]` | member | Smart feed: action needed, next up, incidents, votes, money |
| `/trips/[id]/bookings` | planner | Review and confirm parsed bookings |
| `/trips/[id]/members` | member | Who's in, who's on which booking |
| `/trips/[id]/documents` | member | Your own documents; planner sees results only |
| `/trips/[id]/incidents/[incidentId]` | member (affected) | The playbook, with citations linking to `/rules/[id]` |
| `/trips/[id]/votes/[voteId]` | member | One-tap vote, reachable from SMS |
| `/trips/[id]/money` | member | Who owes what, with pay links |
| `/trips/[id]/calendar.ics` (v2) | member | Calendar export |
| `/admin` | founder | Hand-run trip watching, incident queue, comp passes |
| `/api/attribution?since=<date>` | foundry key | Per-`postId` counts of clicks, forwarded bookings, and paid trip passes for `foundry track sync`. Bearer key `FOUNDRY_ATTRIBUTION_KEY`, read-only |
| `/api/webhooks/inbound-email` | webhook | Resend `email.received`, signature verified |
| `/api/webhooks/aeroapi/[secret]` | webhook | AeroAPI alert delivery (unguessable path token) |
| `/api/webhooks/stripe` | webhook | Checkout completion |
| `/api/webhooks/twilio` | webhook | Inbound SMS (STOP/HELP handled by Twilio Advanced Opt-Out), delivery status |

`/api/rules.json` and `/mcp` are served from this app but owned by track D.

## Flows

### 1. Intake

1. Each trip gets the address `<inbound_code>@in.<domain>`. The planner forwards
   confirmations to it or uploads screenshots.
2. Only mail from the planner's verified email or a joined member's email is processed.
   Anything else is quarantined for the planner to approve. This blocks booking
   injection.
3. `intakeWorkflow(messageId)` runs these steps:
   1. Fetch the body and attachments from Resend.
   2. Extract with `generateObject` against a zod booking schema that includes a
      confidence per field.
   3. Dedupe on confirmation code plus segment.
   4. Persist the result.
   5. Match passenger names to members.
4. Any field below 0.9 confidence, or any unmatched passenger, creates a planner action
   item: "Confirm this booking." A segment is not monitored until it is confirmed.

### 2. Group join

1. The planner drops `/join/<token>` in the group chat. The token is 128 random bits,
   stored hashed, revocable, and expires at trip end + 7 days.
2. A member enters a name plus a phone or email and gets a Supabase OTP. SMS opt-in is an
   explicit checkbox, recorded in `consents`.
3. The member confirms which pre-matched bookings they're on and adds their pay handle.
   That's the whole onboarding.

### 3. Document checks (before)

Each member optionally enters passport issuing country and expiry, and whether their
state ID is REAL ID-compliant. Checks run on join, on booking change, at T-30 days, and at
T-72 hours.

The facts `passenger.nationality`, `passenger.passport_months_valid_after_return`,
`passenger.has_real_id`, and `trip.destination_country` go to `match()`. Results land in
`document_checks`. Failures become action items assigned to the member, and partner
routes are offered for renewals.

A member who skips entry gets `unknown`. The planner sees "Sam hasn't confirmed their
passport" and never the date.

### 4. Monitoring

`tripMonitorWorkflow(tripId)` starts when a pass is active (or comped) and the first
segment is confirmed. For each segment it registers an AeroAPI alert with
`target_url = /api/webhooks/aeroapi/[secret]` and stores `aeroapi_alert_id`. Then:

| Window | Behavior |
|---|---|
| until T-72h | `sleep` |
| T-72h | Re-run document checks; send the pre-trip briefing |
| T-24h → T-6h | Wait on the segment's hook, racing `sleep("2h")`; on timeout, poll `GET /flights/{ident}` |
| T-6h → arrival | Same race with `sleep("30m")` |
| after the last arrival | End at trip end + 7 days (v2: credits sweep) |

The AeroAPI webhook handler maps the alert to a segment and calls `resumeHook` with the
segment's token. Events dedupe on (`fa_flight_id`, event code, timestamp). If alert
registration fails, the segment runs on the polling schedule alone.

### 5. Disruption → playbook

1. **Classify** the event into the rules facts vocabulary: `event.type`,
   `event.delay_minutes`, `flight.*`, `trip.booked_via`.
2. **Match** with `match(situation)` from `@elsewhere/rules`. Rules that "may apply"
   because a fact is unknown (most often `passenger.accepted_alternative` or
   `event.cause`) generate one targeted question to the planner by SMS and in the app.
   The answer resumes the workflow through a hook.
3. **Generate** the playbook with `generateObject` against this schema:

   ```
   { summary,
     owed:     [{ text, rule_ids[] }],
     steps:    [{ text, rule_ids[] }],
     messages: [{ to: airline|hotel|ota|group, channel, body, rule_ids[] }],
     caveats }
   ```

   The prompt contains only `verified` matched rules. `needs_review` rules are excluded
   and named in `caveats` as "being re-checked."
4. **Citation check** (deterministic). It fails the playbook if:
   - any `owed` or `messages` item lacks a rule ID,
   - any cited rule is not in the verified matched set,
   - any amount or deadline in the text differs from the cited rule's `entitlement`.

   On failure it regenerates once. If that fails too, it falls back to a deterministic
   template built from the rules' `how_to_claim`.
5. **Options and vote.** When the choice is the group's (take tomorrow's 7am, or tonight
   via Denver), options come from the airline's offer as the planner enters it, and from
   AeroAPI schedule data labeled "availability not confirmed — ask the airline." A vote is
   created and linked from the notification.
6. **Notify** only `booking_members` of the affected booking. SMS goes first for urgent
   events, with email always sent too. Non-urgent messages respect 9pm–8am local quiet
   hours.

### 6. Who owes what

Expenses come from the planner or members, including incident costs like the emergency
hotel. A minimal-transfers settlement is computed and rendered as pay links:
- **Venmo:** `https://venmo.com/<username>?txn=pay&amount=<x>&note=<note>`.
- **Cash App:** `https://cash.app/$<cashtag>`, with the amount shown beside it.

Members mark transfers as settled. No money moves through Elsewhere.

### 7. Rule pages, the offer, and the payment test

Rule pages are prerendered from `dist/rules.json` at deploy, with a deploy hook fired when
track A merges a rule change. Each page shows:
- the rule in plain language,
- the steps,
- the sources with their quotes,
- the lead character's art from track B,
- and the offer.

| | |
|---|---|
| Offer | "Forward your group's bookings and we'll watch the trip." |
| Free | Forwarding, parsed itinerary, the group's document check |
| Paid (one-time trip pass, up to 12 members) | Monitoring, cited playbooks, group alerts, votes |
| Price variants | **$9** and **$19**, assigned 50/50 by `anonymous_id` cookie in `experiment_assignments` |
| Funnel events | `rule_page_view` → `offer_click` → `trip_started` → `booking_forwarded` → `checkout_started` → `paid` |
| Attribution | Track B posts link through `/r/[postId]`; UTM and DM-link parameters are stored in `attribution_touchpoints` and joined to funnel events by `anonymous_id`, then to the trip after sign-in |
| Bars (from the program spec) | ≥ 3% of rule-page visitors forward at least one booking; paid conversions at either price, with the launch price chosen by revenue per forwarder; actionable events logged per hand-watched trip |
| Readout | After 2,000 rule-page visitors or 4 weeks, whichever comes first |

Comped passes (`pass_status = comp`, Stripe 100% promotion codes) are excluded from the
paid metrics.

### 8. Affiliate pages (money sub-series)

The payout research found affiliate links on our own pages to be the strongest
monetization next to the app. `/money/[slug]` pages are built from money-domain rules
(card trip-delay coverage, rental car coverage, travel insurance), with:
- FTC disclosure at the top,
- issuer-approved copy and rates-and-fees links where a card program requires them.

**Card programs** pay roughly $50–200 per approval but need a network application with a
real site. These pages are that site.

**Travel insurance** (SafetyWing about 10% recurring, World Nomads about 10%) is linked
only after confirming each program's terms allow referral payouts to US affiliates. These
rates are creator-reported and are confirmed in each program dashboard before launch.

### 9. Hand-run watching

`/admin` lists every trip and lets the founder run the same tooling manually:
- attach a pass by promo code,
- trigger checks,
- view incidents,
- edit a playbook before it sends, with every edit logged in `incident_events`.

The 10–20 follower trips run here, and each actionable event is logged for the payment
test.

## Providers and setup

| Provider | Needed |
|---|---|
| Vercel | Project, AI Gateway (OIDC), Workflow, production domain |
| Supabase | Existing project. Phone auth via Supabase's Twilio integration |
| Resend | Receiving domain `in.<domain>` (MX records), sending domain, API key, webhook secret |
| FlightAware AeroAPI | API key on a tier that includes alerts. Confirm alert and polling quotas against expected trip volume before launch |
| Twilio | Messaging Service, plus **A2P 10DLC brand and campaign registration or toll-free verification**. US carriers block unregistered application-to-person SMS. Registration starts on day one, and notifications run email-only until it clears |
| Stripe | Account, two Prices ($9, $19), webhook secret, promotion codes for comps |
| Affiliate programs | Card network application, SafetyWing and World Nomads accounts |

## Privacy and security

- **Minimum data.** Passport issuing country and expiry, and REAL ID yes/no; nothing
  else. `member_documents` rows are deleted 30 days after trip end unless the member
  chooses to keep them on their profile.
- **Raw inbound email and screenshots** are kept 30 days, then deleted. Extracted
  bookings are kept for the trip plus one year, for claims and credits.
- **Confirmation codes** are visible only to members on that booking and the planner.
- **AI.** Calls go through AI Gateway with provider no-training settings. Document fields
  are never sent to a model; checks are deterministic.
- **Tokens.** Join tokens and inbound codes are random, unguessable, and revocable.
  Webhook signatures are verified for Resend, Stripe, and Twilio, and the AeroAPI path
  token is rotated if leaked.
- **SMS consent** is recorded per member. STOP is honored at the Twilio layer and
  mirrored to `consents`.

## Error handling

| Failure | Behavior |
|---|---|
| Email can't be parsed | `needs_confirmation` with a manual-entry form for the planner |
| Low-confidence fields or unmatched passenger | Planner confirms before the segment is monitored |
| Sender not on the trip | Quarantined until the planner approves |
| AeroAPI alert registration fails or AeroAPI is down | Polling schedule with exponential backoff; persistent failure becomes an `/admin` alert |
| Flight not found | Action item to the planner to check the flight number |
| Unknown rule fact | One targeted question to the planner; the workflow waits on the answer |
| `needs_review` rule | Not cited; named in caveats |
| Playbook fails the citation check twice | Deterministic template from `how_to_claim` |
| SMS undelivered or opted out | Email fallback |
| Duplicate Stripe or AeroAPI deliveries | Idempotent on provider event ID |

## Testing

- **Unit.** Extraction normalization, document checks, settlement math, pay-link
  builders, the citation checker (passing, missing ID, wrong amount, `needs_review`
  cited).
- **Fixtures.** The `mock-trip-guides.ts` scenarios become situation → expected rule ID
  cases.
- **Extraction evaluation.** 30 real confirmation emails (founder's own and volunteers',
  anonymized) across major airlines, OTAs, and hotels. Target: at least 95% exact on
  flight number, date, and passenger names. Lower confidence must route to confirmation.
- **Replay evaluation.** 50 real past delays and cancellations pulled from AeroAPI
  history, run through classify → match → playbook. The citation check must pass 100%.
  Playbooks are graded against the expected rules.
- **Workflow.** Hook resumes driven by fake AeroAPI payloads; the polling fallback with
  alerts disabled.
- **End-to-end (Playwright),** with Stripe, Twilio, and Resend in test mode:
  1. rule page → offer → OTP
  2. inject an inbound-email fixture → confirm bookings
  3. a second user joins by link
  4. a simulated cancellation
  5. SMS and email sent, the playbook page shows citations, the vote is cast
  6. checkout completes

## Phasing

| Phase | Scope |
|---|---|
| **v1** | Repo merge and mobile archive. Auth and OTP join. Intake (email and screenshots). Members and booking assignment. Document checks. Monitoring workflow. Incidents → cited playbooks. SMS and email. Votes. Who-owes-what. Rule pages with the offer and Stripe. `/admin` hand-run console. Money affiliate pages |
| **v2** | Travel credits with expiry reminders. Price drops (needs a shopping API such as Duffel, evaluated then). TikTok/IG link → place (`importSocialLink` contract, rewritten on TikTok oEmbed and Meta oEmbed with LLM place extraction). `.ics` export. Recap reel from member-picked photos (rendered by foundry) |
