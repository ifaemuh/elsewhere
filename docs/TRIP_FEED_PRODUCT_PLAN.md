# Elsewhere Trip Feed Product Plan

## North Star

Elsewhere turns travel imagination into lived memory.

The product loop is:

1. Dream it: AI preview in Discover.
2. Book it: package, split, finance, and confirm.
3. Live it: trip feed, schedule, group decisions, payments, and Assist.
4. Relive it: real trip recap video and past-trip archive.

The emotional loop is:

```text
AI preview -> booked trip -> real memories -> recap video -> social sharing -> next trip
```

The core line:

```text
Before the trip: see yourself there.
During the trip: Elsewhere helps you live it.
After the trip: Elsewhere shows what actually happened.
```

## App Structure

Consumer navigation should stay calm and mobile-native:

```text
Discover
Trips
Profile
```

`Discover` combines personalized previews, deal radar, destination ideas, and broad Assist intelligence. It should feel like an intelligent travel feed, not a dashboard.

`Trips` is the home for upcoming, active, and past trips. Use a top-right filter button instead of a persistent segmented control so the feed can flow naturally.

`Profile` contains identity, reference photos, travel documents, payment methods, financing plans, credits/refunds, preferences, and integrations.

Wallet, Assist, group chat, checklists, documents, and schedules should become layers inside a trip or cards inside Discover, not permanent top-level tabs.

Broad discovery and deal intelligence can live in Discover. Always-on monitoring for a booked or active trip should live inside that trip’s own feed.

## Trips Tab

The Trips tab is a vertical feed of trip cards with a top-right filter:

```text
Trips                         [Filter]
```

Filter options:

- All
- Action needed
- Upcoming
- Active
- Past

Default:

- Show all trips.
- Sort trips with action needed to the top.
- Then sort active, upcoming, and past trips.

Cards adapt by trip state:

- Upcoming: start date, action items, payment status, admin reminders, free-cancel windows.
- Active: today’s plan, group status, Assist alerts, nearby suggestions, new photos.
- Past: recap treatment at the top of the past trip card, photo/video count, final expenses, refunds/credits, similar next-trip prompt.

Trip names should be clean and memory-like: `Place Year`, such as `Tokyo 2026` or `Lisbon 2026`. Avoid campaign-style names like `Tokyo Pulse`. Elsewhere can attach one restrained, Apple-like line based on the contents of the trip, itinerary, group context, and recap, but the line should support the trip name rather than replace it.

## Trip Detail

Trip detail should default to a smart feed, not a dense tool surface.

Avoid a visible `Feed / Schedule / Group` mode switch as the default. Deep tools should exist behind cards or a small menu, but the primary experience should be a calm scroll.

Default trip feed cards:

- Next up
- Today’s plan
- Join-later option
- Vote needed
- Assist alert
- Nearby restaurant/event/attraction suggestion
- New photos or social posts
- Payment or checklist reminder
- Document/admin reminder
- Past-trip recap treatment for completed trips

The trip menu can expose deeper views:

- Schedule
- Explore
- Group chat
- Payments
- Checklist
- Documents
- Settings

The API plan for trip feed cards, schedule, planner suggestions, votes, join-later flows, action items, messages, payments, and notifications lives in [TRIP_ROOM_PLANNER_API_PLAN.md](TRIP_ROOM_PLANNER_API_PLAN.md).

## Dynamic Planner

The active trip feed should include a dynamic local guide:

- Nearby restaurants
- Events
- Attractions
- Bookable experiences
- Hidden gems
- Weather-aware suggestions
- Transit/time-to-arrive context
- Free-time-aware suggestions
- Traveler preference matching

Group plans must support split participation. The app should not assume everyone does everything together.

Example:

```text
7:00 PM
Group A: Dinner at Ramen Nagi
You, Alex, Mia

Group B: Rest at hotel
Taylor

9:30 PM
Golden Gai jazz bar
You, Jordan
Taylor can join later · 12 min walk
```

## Trip Media Feed

Users should not need to take photos inside Elsewhere. They should use native Camera, Photos, Instagram, TikTok, etc.

Elsewhere should optionally connect to the native photo library and detect trip-matched media using:

- Trip dates
- Location metadata
- Nearby trip places
- Group membership
- Manual approval

Media sharing modes:

- Off
- Approval required
- Auto-share trip-matched photos

Cards in the trip feed:

- “Mia added 4 photos near Shibuya”
- “You took 12 photos at TeamLab”
- “Jordan posted a Reel from Golden Gai”
- “Share selected to the trip recap”

Privacy must be explicit. Case-by-case approval is the safe default.

The API and approval model lives in [TRIP_MEDIA_FEED_API_PLAN.md](TRIP_MEDIA_FEED_API_PLAN.md). The key rule is that Elsewhere can suggest media based on geo/time/schedule matching, but the media owner controls whether private candidates become shared trip-feed items.

## Recap Loop

Recap originates and lives inside the trip.

For completed trips, the feed becomes memory-first:

- Recap treatment at the top of the past trip card
- Best photos
- Places visited
- Final expenses
- Refund/credit status
- Shared album
- Plan a similar trip

Previous trips live under `Trips -> Past`, not primarily under Profile.

Recap should mirror the original AI preview:

```text
Then: AI showed you in Tokyo.
Now: Elsewhere shows the real Tokyo you lived.
```

The recap should be saved to the trip archive and optionally shown in Profile as part of broader travel history/shared media.

Recap should not appear as a separate standalone trip card. It is part of the completed trip card and the completed trip surface.

## Build Sequence

1. Refactor mobile nav toward Discover / Trips / Profile.
2. Turn Trips into a filtered feed of upcoming, active, and past trip cards.
3. Convert Trip Detail into the default smart feed.
4. Move Assist alerts, deal radar, and cancellation/credit intelligence into trip cards.
5. Move wallet/payment/group chat concepts into trip feed cards and trip menu views.
6. Add trip room APIs for feed, schedule, planner suggestions, votes, participation, action items, messages, payments, and notifications.
7. Add mock dynamic planner cards for restaurants, events, attractions, votes, split-group plans, join-later flows, and reserve/book CTAs.
8. Add mock media cards for photos/videos/social posts with explicit share modes.
9. Add completed-trip recap treatment inside past trip cards and Past trip archive behavior.
10. Later, connect live providers:
   - places/events/bookable experiences
   - photos/media library permissions
   - social import/export
   - recap generation

## Product Principle

Elsewhere should feel like a calm guide, not a control panel.

The user should scroll naturally and see what matters now.
