# Elsewhere Product Brief

## Core Thesis

Elsewhere is a mobile-first AI travel platform that turns imagination into affordable, bookable, protected travel.

Most travel products start with search results and prices. Elsewhere starts with desire: users see themselves and their friends in a cinematic trip preview on their phone, then move directly into scheduling, booking, payment splitting, financing, travel admin, native sharing, and real-time trip protection.

The product loop is:

1. Dream it: AI preview.
2. Book it: package, split, finance, and confirm.
3. Live it: trip feed, schedule, group decisions, payments, and Assist.
4. Relive it: real trip recap video and past-trip archive.

## One-Liner

Elsewhere lets you see your dream vacation, split it with friends, and pay it off monthly before you ever pack a bag.

## Platform Direction

Elsewhere should be a mobile app first, and potentially mobile-only for the consumer product.

The web surface is not the core product. It can exist as a development harness, deep-link fallback, admin/support surface, or lightweight install funnel, but the main user experience should happen in the mobile app:

- Capture or upload selfies.
- Generate personalized previews.
- Export/share previews through native social surfaces.
- Turn previews into trip quotes.
- Coordinate group wallets and trip rooms.
- Receive real-time Assist alerts.

This matters because the viral loop depends on native media creation, camera access, push notifications, contacts, calendars, and sharing flows. Those are mobile-native behaviors.

## Product Pillars

### 1. AI Dream Engine

Users generate cinematic previews of themselves, friends, or families inside real, branded, or fantasy-inspired destinations.

This makes discovery emotional and shareable. It shifts travel from "look at this place" to "look at me there."

The preview system depends on a reusable reference library and multiple scene/activity presets per destination. A beautiful output is not enough; the result must actually resemble the user.

Video generation can be tested behind backend-only feature flags, but still previews and native 9:16 motion exports remain the reliable first path until video quality, cost, latency, and API access are proven.

Primary outcomes:

- Higher booking confidence.
- Organic social sharing.
- Emotional attachment before checkout.
- Sponsored destination and brand campaign inventory.

### 2. Trip Package Generator

Once a user likes a preview, Elsewhere converts the destination concept into a real package: flights, hotels, activities, transfers, and dates that fit the user's life.

Primary outcomes:

- Fewer booking drop-offs.
- Higher attach rates for activities and transfers.
- Clearer path from inspiration to checkout.
- Partner-ready booking orchestration.

### 3. Financing Gateway

Elsewhere makes aspirational trips feel reachable by showing the monthly cost, 0% financing options, and payment schedule directly after the emotional preview moment.

Elsewhere does not become a lender. It orchestrates licensed financing partners such as travel BNPL providers and white-label fintech partners.

Primary outcomes:

- Price friction becomes affordability framing.
- Users move from "I wish" to "I can do this for $X/month."
- Partners get higher conversion on aspirational travel.
- Financing disclosures and obligations remain partner-backed and auditable.

### 4. Trip Feed, Group Room, And Wallet

Each trip has a living feed for itinerary approval, payment status, monthly progress, chat, reminders, local suggestions, group decisions, media, and traveler accountability.

The default experience should not feel like a dashboard. It should feel like a calm, intelligent trip feed that surfaces the next useful card at the right time.

Trip media can come from native photo libraries, manual uploads, videos, and approved social posts. Elsewhere can suggest likely trip media using time, geolocation, schedule, and group context, but private media should only enter the shared trip feed after the owner’s approval unless the owner has explicitly enabled auto-share.

Primary outcomes:

- Group travel coordination becomes visible.
- Payment awkwardness is reduced.
- More travelers complete purchase.
- Average trip value increases.
- Real memories and recap content flow naturally back into the trip.

### 5. Travel Admin Assistant

Elsewhere handles the boring things that can break a trip: passport expiration, TSA PreCheck, Global Entry, document reminders, and partner handoffs for renewals or applications.

Primary outcomes:

- Trip failures are prevented before checkout.
- Elsewhere stays useful outside active trips.
- Premium and referral revenue streams expand.
- User trust compounds through practical utility.

### 6. Elsewhere Assist

Elsewhere Assist is the moat: an always-on, rules-aware travel problem solver.

It is not a chatbot. It monitors trips, understands airline, hotel, OTA, fare, credit, and refund rules, detects disruption risk, and executes the best allowed action when possible.

Assist should combine official provider APIs, booking records, public policy research, deal feeds, Reddit/community signals, advisories, and deterministic rule scoring. Public signals can alert and inspire; official provider data and booking records are required before Elsewhere acts on a trip.

Primary outcomes:

- Delays and cancellations are handled earlier.
- Credits are treated like assets, not fine print.
- Human escalation happens only when high-value and well-supported.
- Elsewhere becomes a travel management system, not just a planning app.

## Monetization

- Affiliate and referral fees from bookings.
- Financing partner economics.
- Branded destination packs from tourism boards, hotels, resorts, airlines, and entertainment brands.
- Travel document service referrals or premium convenience tiers.
- Support, assist, and protection tiers for active travelers.

## Strategic Positioning

Elsewhere combines five products that usually live separately:

1. AI travel inspiration.
2. Travel package generation.
3. Financing and affordability.
4. Group payments.
5. Live trip operations.

The wedge is emotional AI preview generation. The durable business is the post-preview system: booking, payment, admin, and Assist.

## Near-Term Product Focus

The first priority is not adding more product surface. It is proving that AI-generated personalized previews actually work.

Before investing heavily in booking, financing, or social export, the team must validate:

1. A user can upload or capture a selfie.
2. The backend can generate a preview using that reference image.
3. The result clearly resembles the user in the destination.
4. The preview is good enough to share.
5. The flow works from the mobile app, not only from a web harness.

After that, the first shippable path should prove the complete user loop at narrow scope:

1. Generate a personalized destination preview.
2. Convert it into a real trip quote.
3. Show affordability and group split options.
4. Create a checkout session through controlled providers.
5. Track the trip in a room with wallet and Assist surfaces.
6. Record consent, disclosures, partner actions, and audit events throughout.

The goal is not broad inventory on day one. The goal is one magical, financially actionable, operationally trustworthy trip flow.

## Trip Feed Direction

The consumer app should converge toward:

```text
Discover
Trips
Profile
```

Discover combines personalized previews, deal radar, destination ideas, and broad Assist intelligence.

Discover should feel like a short-form documentary travel channel compressed into interactive mobile reels. The content should lead with curiosity, place, nature, food, culture, history, hotels, and human travel stories, then reveal Elsewhere utility: personal relevance, friends, calendar fit, prices, payment plans, booking paths, travel admin, and Assist monitoring. It should borrow the educational/adventurous energy of Discovery Channel and Travel Channel without implying affiliation or copying their formats.

The default Discover reel actions are `Like`, `Learn`, `Plan`, and `Share`. Likes train the feed toward topics the user cares about. Learn opens the story layer. Plan turns the reel into a trip or action. Share uses native sharing.

Trips contains upcoming, active, and past trips behind a simple top-right filter. By default, trips with action needed sort to the top. Trip names should use `Place Year`, with a concise generated tagline from the trip contents. Inside a trip, the default should be a smart feed rather than a dense set of tabs. Assist, wallet, group chat, checklists, local guide suggestions, and media surface as contextual trip cards. Recap lives inside the completed/past trip card and completed trip surface, not as a separate standalone trip card.

Profile contains identity, payment methods, financing plans, travel credits, documents, reference photos, preferences, and integrations.

The detailed product direction lives in [TRIP_FEED_PRODUCT_PLAN.md](TRIP_FEED_PRODUCT_PLAN.md).

Preview/video/recap direction lives in [PREVIEW_VIDEO_RECAP_ROADMAP.md](PREVIEW_VIDEO_RECAP_ROADMAP.md).

Travel intelligence and deal radar direction lives in [TRAVEL_INTELLIGENCE_DEAL_RADAR_PLAN.md](TRAVEL_INTELLIGENCE_DEAL_RADAR_PLAN.md).

Trip media feed API and approval direction lives in [TRIP_MEDIA_FEED_API_PLAN.md](TRIP_MEDIA_FEED_API_PLAN.md).

Trip room, planner, schedule, votes, action items, payments, chat, and notifications direction lives in [TRIP_ROOM_PLANNER_API_PLAN.md](TRIP_ROOM_PLANNER_API_PLAN.md).
