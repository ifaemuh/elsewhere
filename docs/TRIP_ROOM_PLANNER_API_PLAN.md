# Trip Room, Planner, And Action API Plan

## Goal

Each trip should become the calm command center for that journey.

The user should not need separate top-level tabs for wallet, chat, Assist, schedule, or checklist. Those functions should appear as cards in the trip feed and as deeper views from the trip menu when needed.

The trip room owns:

- A clean `Place Year` trip name.
- A concise generated tagline based on the trip contents.
- Smart feed cards.
- Schedule and split-group plans.
- Nearby planner suggestions.
- Votes and approvals.
- Join-later flows.
- Group chat.
- Payments and 0% plan status.
- Checklists and action items.
- Documents/admin reminders.
- Notifications.
- Assist alerts.

## Surface Model

Default surface:

```text
Trip Detail -> Smart Feed
```

Deep views behind cards or a small menu:

- Schedule
- Explore
- Group chat
- Payments
- Checklist
- Documents
- Settings

`Explore` should not become a noisy top-level tab. It can exist as a deeper view, but the default should remain a feed where the app decides what matters now.

## Smart Feed Cards

Feed cards can include:

- Next up.
- Today’s plan.
- Open slot.
- Nearby restaurant/event/attraction.
- Vote needed.
- Join-later option.
- Reservation/booking status.
- Group chat highlight.
- Payment due.
- 0% plan reminder.
- Checklist item.
- Passport/document reminder.
- Assist alert.
- New media.
- Recap-ready treatment for completed trips.

Cards should be ranked by urgency, time, location, participation, and trip state.

Trip cards with action needed should sort above normal active/upcoming/past trips in the Trips tab by default.

## Dynamic Planner

The planner should understand:

- Current location.
- Trip destination.
- Current date/time.
- Existing schedule.
- Free windows.
- Traveler preferences.
- Group availability.
- Weather.
- Transit/walking time.
- Cost.
- Reservation availability.
- Whether the whole group or only part of the group wants to participate.

Suggestions can include:

- Restaurants.
- Events.
- Attractions.
- Hidden gems.
- Hotel/rest options.
- Bookable experiences.
- Weather-friendly alternatives.
- Low-energy/rest options.
- Join-later-friendly options.

Booking buttons can start as mock CTAs and later connect to reservation/activity providers.

## Split Participation

The schedule must support group members doing different things at the same time.

Example:

```text
7:00 PM
Dinner at Ramen Nagi
Participants: You, Alex, Mia

7:00 PM
Rest at hotel
Participants: Taylor

9:30 PM
Golden Gai jazz bar
Participants: You, Jordan
Taylor can join later · 12 min walk
```

Participation statuses:

- `interested`
- `going`
- `not_going`
- `maybe`
- `resting`
- `join_later`
- `needs_vote`

## Core API

Initial API routes:

- `GET /api/v1/trips/{tripId}/feed`
  - Returns ranked smart feed cards.

- `GET /api/v1/trips/{tripId}/schedule`
  - Returns itinerary items, free windows, split plans, and reservation states.

- `POST /api/v1/trips/{tripId}/schedule`
  - Adds a schedule item from a suggestion or manual entry.

- `PATCH /api/v1/trips/{tripId}/schedule/{itemId}`
  - Updates time, participants, status, notes, or reservation metadata.

- `GET /api/v1/trips/{tripId}/planner/suggestions`
  - Returns nearby restaurants, events, attractions, rest options, and bookable experiences.

- `POST /api/v1/trips/{tripId}/planner/suggestions/{suggestionId}/save`
  - Saves a suggestion to the trip.

- `POST /api/v1/trips/{tripId}/planner/suggestions/{suggestionId}/book`
  - Starts mock booking/reservation flow.

- `POST /api/v1/trips/{tripId}/votes`
  - Creates a vote for schedule, activity, restaurant, booking, or trip-change decisions.

- `POST /api/v1/trips/{tripId}/votes/{voteId}/responses`
  - Records a traveler vote.

- `POST /api/v1/trips/{tripId}/schedule/{itemId}/participation`
  - Updates one traveler’s participation.

- `POST /api/v1/trips/{tripId}/schedule/{itemId}/join-later`
  - Creates or updates a join-later intent with ETA/context.

- `GET /api/v1/trips/{tripId}/messages`
  - Returns group chat messages or feed-linked thread summaries.

- `POST /api/v1/trips/{tripId}/messages`
  - Sends a group chat message or card-linked comment.

- `GET /api/v1/trips/{tripId}/action-items`
  - Returns checklist items, approvals, payment tasks, admin reminders, and Assist tasks.

- `PATCH /api/v1/trips/{tripId}/action-items/{actionItemId}`
  - Completes, snoozes, assigns, or reopens an action item.

- `GET /api/v1/trips/{tripId}/payments/summary`
  - Returns payment status, splits, installment plan status, credits, refunds, and due dates.

- `GET /api/v1/trips/{tripId}/notifications`
  - Returns in-app trip notifications and reminders.

- `PATCH /api/v1/trips/{tripId}/notifications/settings`
  - Updates push/in-app/email preferences for the trip.

## Data Model

`TripFeedCard`:

- `id`
- `tripId`
- `kind`
- `priority`
- `title`
- `subtitle`
- `body`
- `cta`
- `source`
- `relatedEntityId`
- `startsAt`
- `expiresAt`
- `visibility`
- `createdAt`

`TripScheduleItem`:

- `id`
- `tripId`
- `title`
- `kind`: `flight`, `hotel`, `restaurant`, `event`, `attraction`, `experience`, `rest`, `free_time`, `custom`
- `startsAt`
- `endsAt`
- `place`
- `participants`
- `reservationStatus`
- `bookingUrl`
- `costEstimate`
- `notes`

`TripPlannerSuggestion`:

- `id`
- `tripId`
- `kind`
- `title`
- `place`
- `distance`
- `travelTime`
- `priceLevel`
- `startsAt`
- `availability`
- `weatherFit`
- `preferenceFit`
- `bookable`
- `source`
- `confidence`

`TripVote`:

- `id`
- `tripId`
- `title`
- `options`
- `requiredParticipantIds`
- `responses`
- `deadline`
- `status`

`TripActionItem`:

- `id`
- `tripId`
- `kind`: `approval`, `payment`, `document`, `checklist`, `assist`, `booking`, `media`
- `title`
- `assignedUserIds`
- `dueAt`
- `status`
- `relatedEntityId`
- `notificationState`

`TripMessage`:

- `id`
- `tripId`
- `senderUserId`
- `body`
- `relatedCardId`
- `createdAt`

## Notifications

Notifications should support:

- In-app reminders.
- Push notifications.
- Optional email for payment/admin deadlines.

Notification triggers:

- Vote needed.
- Payment due.
- 0% plan due date.
- Checklist due.
- Passport/document deadline.
- Free-cancel window closing.
- Assist recommendation.
- Schedule change.
- Join-later update.
- New shared media.
- Recap ready.

Notification priority should be calm by default:

- Urgent: trip-breaking or money-saving deadlines.
- Normal: votes, schedule updates, payment reminders.
- Quiet: media, recap, social prompts.

## Build Sequence

1. Add mock types and fixture data for feed cards, schedule items, suggestions, votes, action items, payment summary, and messages.
2. Add local API routes for feed, schedule, planner suggestions, votes, participation, action items, payment summary, and notifications.
3. Refactor Trip Detail into a smart feed using those cards.
4. Add top-right trip menu for deeper Schedule, Explore, Group chat, Payments, Checklist, Documents, and Settings views.
5. Add mock vote and participation actions.
6. Add mock join-later flow.
7. Add mock reserve/book CTAs for suggestions.
8. Add checklist and notification cards.
9. Wire payments and financing cards to the existing mock trip payment data.
10. Later, connect places/events/reservations, chat persistence, payments, and notification providers.

## Test Plan

Trip feed:

- Feed ranks urgent action cards above generic suggestions.
- Active trips show today/nearby cards.
- Past trips show recap/memory cards.

Planner:

- Suggestions can be saved to schedule.
- Book CTAs remain clearly mocked until provider integration exists.
- Weather/free-time/preference tags render.

Group:

- Users can vote.
- Schedule items support different participants at overlapping times.
- Join-later status appears on the card.

Actions:

- Checklist items can be completed or snoozed.
- Payment/admin reminders appear in the trip feed.
- Notifications can be disabled or quieted.

Payments:

- Payment summary shows total, paid, due, splits, credits, refunds, and 0% plan status.
