# Travel Intelligence And Deal Radar Plan

## Goal

Elsewhere Assist should give the app an edge by combining live provider data, trip records, public policy research, deal feeds, error-fare signals, and community chatter.

The product must be clear about what it knows, where it learned it, and whether a recommendation is safe to act on.

## Source Posture

Default posture:

- API/feed-first.
- Allowlisted sources only.
- No login-only scraping.
- No CAPTCHA bypass.
- No paywall bypass.
- No checkout scraping.
- No pretending public research is booking-specific truth.

Every finding must show:

- Source.
- Source type.
- Confidence.
- Freshness.
- Limitation.
- Whether it is live, mocked, fixture-based, public-research-based, or officially verified.

## Source Kinds

Normalized source kinds:

- `provider_api`
- `deal_feed`
- `reddit`
- `public_research`
- `official_policy`
- `mock`

## Provider Sources

Official or partner-backed sources should become the source of truth for book/change/cancel actions:

- Amadeus flight shopping, pricing, and fare rules.
- Duffel flight shopping/order management.
- FlightAware flight status and disruption monitoring.
- Expedia Rapid hotel inventory and booking data.
- Hotelbeds hotel inventory and booking data.
- Financing partners for payment offers and installment plans.
- Travel-admin partners for passport, TSA PreCheck, and Global Entry flows.

Provider adapters should be credential-aware. If credentials are absent, the app should still run with clear coverage labels.

## Edge Signal Sources

Deal and public signal sources can inspire or alert, but should not directly trigger booking changes without verification.

Initial sources:

- Secret Flying RSS/public feed.
- The Flight Deal RSS/public feed.
- Configurable RSS feeds through `ELSEWHERE_DEAL_FEED_URLS`.
- Reddit API/search for `r/Flights`, `r/travel`, `r/awardtravel`, `r/TravelHacks`, and `r/Shoestring`.
- Public search APIs such as SerpAPI or Tavily for official airline, hotel, airport, government, and advisory pages.

Good signal categories:

- Error fares.
- Flash deals.
- Price drops.
- Fare-rule quirks.
- Schedule changes.
- Cancellation windows.
- Waiver policies.
- Airline operational disruptions.
- Hotel free-cancel deadlines.
- Credit/refund expiration risk.
- Destination events, weather, advisories, and crowding.

## Ranking

Scoring should be deterministic first, with AI used to summarize and explain.

Rank by:

- Source quality.
- Recency.
- Official verification.
- Route relevance.
- Destination relevance.
- Price delta.
- Booking deadline urgency.
- Travel-window fit.
- User/trip preference fit.
- Confidence.
- Risk and reversibility.

AI can help turn findings into readable recommendations, but the deterministic score and source metadata remain the fallback source of truth.

## Trip-Aware Recommendations

Global deal radar belongs in Discover.

Trip-specific intelligence belongs inside the trip feed.

Trip detail should show only relevant opportunities:

- Better flight option on the same route.
- Cheaper nearby hotel if cancellation is still free.
- Credit-preserving rebooking option.
- Route disruption risk.
- Fare waiver that changes the best action.
- Restaurant/event/activity suggestions near the group’s current schedule.

Public deal posts can appear as inspiration, but trip-changing recommendations require provider verification or explicit limitation text.

## API Shape

Core endpoints:

- `GET /api/v1/assist/deal-radar`
- `GET /api/v1/assist/live-intel?tripId=...`

The response should include:

- Deal radar findings.
- Trip-relevant findings.
- Provider coverage.
- Missing credential notices.
- Confidence and limitation text.
- Source URLs when available.

Normalized deal fields:

- Origin.
- Destination.
- Price.
- Currency.
- Travel window.
- Booking window.
- Source URL.
- Confidence.
- Deal score.
- Relevance score.

## Mobile Surfaces

Discover:

- Broad deal radar.
- Destination ideas.
- Error-fare alerts.
- Public travel intelligence.
- Preview prompts tied to good deals.

Trip feed:

- Relevant deal cards.
- Cancellation/rebooking cards.
- Credit/refund protection cards.
- Provider coverage badges.
- “Verify before acting” language when needed.

Every recommendation should answer:

```text
What changed?
Why does it matter?
What can Elsewhere safely do?
What is the source?
How confident are we?
What is the limitation?
```

## Compliance Boundary

Elsewhere can research aggressively, but it should act conservatively.

Public scraping, community posts, and deal feeds are discovery inputs. Official provider APIs, user booking records, and explicit policy citations are action inputs.

That boundary is part of the product trust.
