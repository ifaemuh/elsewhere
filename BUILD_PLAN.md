# Elsewhere Master Build Plan

Product strategy and positioning live in [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md).
Trip feed, recap, and simplified navigation direction live in [docs/TRIP_FEED_PRODUCT_PLAN.md](docs/TRIP_FEED_PRODUCT_PLAN.md).
Trip room, planner, schedule, votes, action items, and notifications live in [docs/TRIP_ROOM_PLANNER_API_PLAN.md](docs/TRIP_ROOM_PLANNER_API_PLAN.md).
Preview, video, and recap validation live in [docs/PREVIEW_VIDEO_RECAP_ROADMAP.md](docs/PREVIEW_VIDEO_RECAP_ROADMAP.md).
Trip media feed API and approval direction live in [docs/TRIP_MEDIA_FEED_API_PLAN.md](docs/TRIP_MEDIA_FEED_API_PLAN.md).
Travel intelligence and deal radar direction live in [docs/TRAVEL_INTELLIGENCE_DEAL_RADAR_PLAN.md](docs/TRAVEL_INTELLIGENCE_DEAL_RADAR_PLAN.md).

## Short Answer
All 4 items are possible.
They are not blocked by technology; they are blocked by sequencing, contracts, compliance, and operations.

## Principles
1. Build adapters and orchestration first, not provider lock-in.
2. Keep regulated functions delegated to licensed partners.
3. Ship in layers: UX -> orchestration -> partner APIs -> automation -> scale.
4. Everything behind feature flags.

## Program Tracks

### Track A: Mobile App (primary product surface)
- Discover (AI previews, destination ideas, deal radar, broad Assist intelligence)
- Trips (filtered upcoming/active/past feed)
- Trip Detail (smart feed, schedule cards, group decisions, payments, Assist, media, recap)
- Profile (identity, docs/admin, payments, financing plans, credits/refunds, integrations)
- Native preview/export/share/recap loop

### Track A2: Web (supporting surface only)
- Development/debug harness for preview generation
- Optional deep-link fallback and install funnel
- Future admin/support tooling

### Track B: Backend Platform
- Auth + user identity
- Trip orchestration APIs
- Trip room feed, planner, schedule, votes, action items, chat, payments, and notifications
- Preview job orchestration
- Trip media ingestion, matching, approval, and recap APIs
- Assist event ingestion + policy engine
- Travel intelligence source registry
- Deal radar and edge-signal ingestion
- Provider adapters (travel, financing, travel-admin)

### Track C: Compliance + Risk
- Consent and rights attestation
- PII/financial data handling
- Audit logs and immutable event history
- Disclosure and consent versioning

### Track D: Partnerships
- Travel supply (flights/hotels/activities)
- Financing providers (0% offers)
- Travel admin partners (passport/TSA/Global Entry)
- SLA/incident channels

## Execution Phases

## Build Status
- Phase 0: Completed in app architecture
- Phase 1: Completed in app architecture
- Phase 2: Completed in app architecture
- Phase 3: Completed in app architecture
- Phase 4: Completed in app architecture
- Phase 5: Completed in app architecture

## Phase 0: Foundation Hardening (1-2 weeks)
Deliverables:
1. Replace direct Sora key usage with backend-only token flow.
2. Add environment config (`dev/staging/prod`) and feature flags.
3. Add telemetry events for funnel: preview -> plan -> book.
4. Add server-side consent records (timestamp, policy version, media rights attestation).

Exit criteria:
- No secret keys in client.
- All preview requests auditable.

## Phase 1: One-Click Booking v1 (3-5 weeks)
Deliverables:
1. Trip API contracts:
   - `POST /trips/quote`
   - `POST /trips/checkout-session`
   - `GET /trips/{id}`
2. Provider adapter interfaces.
3. Checkout state machine (`quote_created -> reserved -> payment_pending -> confirmed -> failed`).
4. Partial-failure rollback and retry strategy.

Exit criteria:
- End-to-end booking for at least one destination with one provider stack.

## Phase 2: Financing + Group Wallet v1 (3-4 weeks)
Deliverables:
1. Financing gateway service (Elsewhere as orchestrator, not lender).
2. Endpoints:
   - `POST /financing/offers`
   - `POST /financing/checkout`
   - `POST /financing/webhooks`
3. Group wallet ledger model and installment schedule.
4. Disclosure + consent logging.

Exit criteria:
- User can accept provider offer and split obligations across travelers.

## Phase 2A: Trip Room + Planner v1 (2-3 weeks)
Deliverables:
1. Trip feed, schedule, planner suggestion, vote, participation, join-later, action item, message, payment summary, and notification API contracts.
2. Local/mock trip room data for restaurants, events, attractions, chat, payments, checklist, documents, and Assist cards.
3. Smart feed ranking for next-up, urgent action, local guide, group decision, payment, checklist, media, and completed-trip recap treatments.
4. Mock reserve/book CTAs for nearby suggestions.
5. Split-participation schedule and join-later flows.

Exit criteria:
- Active trip detail feels like a living trip feed, not a booking receipt.
- Users can vote, join later, save suggestions, complete action items, and see group/payment status in one calm feed.
- Deep views remain available behind cards/menu without cluttering the default screen.

## Phase 2B: Trip Feed Media + Approval v1 (2-3 weeks)
Deliverables:
1. Trip media API contracts for listing, candidates, uploads, social posts, approvals, and share settings.
2. Local/mock media source for photos, videos, and social posts.
3. Approval-required flow for candidate media.
4. Trip feed cards for media suggestions, shared media, and recap candidates.
5. Audit events for approval, rejection, hiding, and recap inclusion.

Exit criteria:
- Users can add or approve mock photos, videos, and social posts into a trip feed.
- Private candidate media does not become visible to the group until approved by its owner.
- Recap candidates are built only from approved or explicitly selected media.

## Phase 3: Assist Monitor + Policy Engine v1 (4-6 weeks)
Deliverables:
1. Ingestion pipeline for status and booking changes.
2. Normalized policy schema for fare/hotel rules.
3. Rule evaluator for allowed actions.
4. Action executor for rebook/credit/escalation.
5. Incident timeline bound to live events.
6. Source-labeled travel intelligence and deal radar findings.
7. Provider coverage reporting for missing or configured credentials.

Exit criteria:
- Live disruption case auto-resolved for supported scenarios.
- Public deal/community signals are visible, scored, and clearly limited until verified by official providers.

## Phase 4: Travel Admin Integrations v1 (3-4 weeks)
Deliverables:
1. Secure document handling pattern.
2. Admin endpoints for passport reminders and trusted traveler flows.
3. Partner routing (referral/deep link + embedded API where available).

Exit criteria:
- Real reminders and partner handoff completed from app.

## Phase 5: Scale + Monetization (ongoing)
Deliverables:
1. Branded destination pack CMS.
2. Attribution and affiliate/referral reconciliation.
3. Experimentation framework.
4. Support console and manual override tooling.

Exit criteria:
- Branded campaigns and attribution active in production.

## Regulated/Partner-Dependent Solutions

1. 0% financing
- Integrate licensed financing partners.
- Elsewhere handles UX/orchestration/ledger/disclosures.

2. Airline/hotel policy monitor
- Start narrow with a constrained provider set and deterministic rules.
- Expand coverage with versioned policy tests.

3. One-click booking
- Start with controlled inventory/provider adapters.
- Implement reservation timeout and rollback logic.

4. Travel admin
- Partner-first model:
  - Tier 1: referral/deep links
  - Tier 2: embedded API applications

## Immediate Next Coding Steps
1. Validate mobile selfie/reference-photo preview generation end to end.
2. Confirm AI output quality is strong enough to anchor the product.
3. Refactor mobile navigation toward Discover / Trips / Profile while keeping current test surfaces reachable.
4. Turn Trips into a filtered feed where action-needed trips sort to the top by default.
5. Convert Trip Detail into a smart feed with cards for Assist, payments, schedule, group decisions, local guide suggestions, media, and recap.
6. Fold Deal Radar and broad Assist intelligence into Discover while keeping trip-specific monitoring inside trip detail.
7. Add trip room API contracts for feed, schedule, planner suggestions, votes, participation, action items, messages, payment summary, and notifications.
8. Add mock dynamic planner cards for nearby restaurants, events, attractions, voting, split participation, join-later flows, and reserve/book CTAs.
9. Add trip media API contracts for photos, videos, social posts, geo/time matching, approval actions, and share settings.
10. Add mock trip media cards, privacy/share modes, and completed-trip recap treatment inside past trip cards.
11. Add native 9:16 preview/export/share loop and later recap generation.
12. Move mobile off Expo Go when native sharing, media library, social export, or video dependencies require a custom dev client.

## Definition of Done
1. Personal preview -> real booking flow is live.
2. Financing offers + split payments are live via partners.
3. Assist can auto-fix at least one disruption class.
4. Travel admin workflows are actionable via partners.
5. Full funnel is observable with analytics and support tooling.
