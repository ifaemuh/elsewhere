# Elsewhere Master Build Plan

## Short Answer
All 4 items are possible.
They are not blocked by technology; they are blocked by sequencing, contracts, compliance, and operations.

## Principles
1. Build adapters and orchestration first, not provider lock-in.
2. Keep regulated functions delegated to licensed partners.
3. Ship in layers: UX -> orchestration -> partner APIs -> automation -> scale.
4. Everything behind feature flags.

## Program Tracks

### Track A: Consumer App (iOS)
- Discover (Sora personal previews)
- Trips (package + booking)
- Wallet (split + installments)
- Assist (live disruptions + actions)
- Profile (docs/admin/integrations)

### Track B: Backend Platform
- Auth + user identity
- Trip orchestration APIs
- Preview job orchestration
- Assist event ingestion + policy engine
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

## Phase 3: Assist Monitor + Policy Engine v1 (4-6 weeks)
Deliverables:
1. Ingestion pipeline for status and booking changes.
2. Normalized policy schema for fare/hotel rules.
3. Rule evaluator for allowed actions.
4. Action executor for rebook/credit/escalation.
5. Incident timeline bound to live events.

Exit criteria:
- Live disruption case auto-resolved for supported scenarios.

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
1. Add backend API clients + contracts for trips and financing.
2. Replace local booking actions with backend-backed trip state machine.
3. Add wallet ledger sync model.
4. Add Assist event stream hooks (polling/websocket).

## Definition of Done
1. Personal preview -> real booking flow is live.
2. Financing offers + split payments are live via partners.
3. Assist can auto-fix at least one disruption class.
4. Travel admin workflows are actionable via partners.
5. Full funnel is observable with analytics and support tooling.
