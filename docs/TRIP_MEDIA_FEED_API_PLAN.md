# Trip Media Feed API And Approval Plan

## Goal

Elsewhere should let trip members add photos, videos, and social posts into the trip feed without forcing them to take content inside Elsewhere.

The app should detect likely trip media from time, location, schedule, and group context, then ask for the right level of approval before anything becomes visible to the group or eligible for a recap.

## Media Sources

Supported sources:

- Native photo library candidates.
- Manual photo/video uploads.
- Optional in-app camera captures.
- Social post links.
- Social caption/post suggestions generated from approved trip media.
- Future social imports from Instagram, TikTok, and similar providers when APIs/permissions allow.
- Group member submissions.
- Generated recap outputs.

Native photo library matching should happen on-device first when possible. The app should avoid uploading full-resolution media until the user approves it.

## Matching Logic

Trip media candidates can be matched by:

- Trip date range, with configurable before/after buffers.
- Photo/video capture timestamp.
- GPS coordinates and location accuracy.
- Proximity to scheduled trip stops.
- Proximity to nearby places, attractions, restaurants, hotels, airports, or events.
- Creator membership in the trip.
- Manual user selection.
- Social post timestamp, location tag, caption, or linked place.

Each candidate should receive a match confidence:

- `high`: timestamp and location strongly match the trip.
- `medium`: timestamp or location matches, but not both.
- `low`: weak inferred match, needs manual confirmation.
- `manual`: user explicitly added it.

The feed can show gentle prompts like:

```text
You took 12 photos near Shibuya Crossing. Add them to the trip?
```

## Approval Model

Case-by-case approval is the default.

Sharing modes:

- `off`: do not scan or suggest media.
- `approval_required`: suggest matched media, but require owner approval before sharing.
- `auto_share_trip_matched`: share high-confidence trip-matched media automatically after explicit opt-in.

Approval rules:

- The media owner controls whether their media is shared.
- Elsewhere should not publish someone else’s private candidate automatically.
- A trip owner/admin can hide or remove shared media from the group feed, but should not be able to approve another member’s private media.
- Recap selection uses shared/approved media by default.
- A user can mark approved media as excluded from recap.
- Social post cards require explicit user approval and provider-compliant permissions.
- Social caption/post suggestions should never publish automatically.
- Precise location metadata should be minimized and only shown when useful.
- Every approval, rejection, hide, and recap-selection action should be auditable.

Approval statuses:

- `candidate`
- `pending_owner_approval`
- `shared`
- `rejected`
- `hidden`
- `recap_selected`
- `recap_excluded`

## Core API

Initial API routes:

- `GET /api/v1/trips/{tripId}/media`
  - Returns shared feed items plus the current user’s private candidates.

- `POST /api/v1/trips/{tripId}/media/candidates`
  - Receives metadata-only candidates from an on-device library scan.
  - Should support batch ingestion.

- `POST /api/v1/trips/{tripId}/media/uploads`
  - Creates a manual upload record and returns upload/storage instructions.

- `POST /api/v1/trips/{tripId}/media/social-posts`
  - Adds a user-approved social post link/card to the trip feed.

- `POST /api/v1/trips/{tripId}/media/social-caption-suggestions`
  - Generates suggested captions or post copy from approved media and trip context.
  - Returns draft text only; the user must publish manually.

- `PATCH /api/v1/trips/{tripId}/media/{mediaId}`
  - Updates caption, place, visibility, or recap inclusion.

- `POST /api/v1/trips/{tripId}/media/{mediaId}/approval`
  - Approves, rejects, hides, restores, selects for recap, or excludes from recap.

- `POST /api/v1/trips/{tripId}/media/bulk-approval`
  - Approves or rejects multiple candidate items.

- `GET /api/v1/trips/{tripId}/media/share-settings`
  - Returns the user’s media sharing settings for the trip.

- `PATCH /api/v1/trips/{tripId}/media/share-settings`
  - Updates sharing mode, source preferences, and recap defaults.

- `POST /api/v1/trips/{tripId}/recap/candidates`
  - Returns approved media and itinerary moments likely to belong in the recap.

- `POST /api/v1/trips/{tripId}/recap/generate`
  - Starts recap generation from approved media and trip context.

## Data Model

`TripMediaItem`:

- `id`
- `tripId`
- `ownerUserId`
- `source`: `photo_library`, `manual_upload`, `in_app_camera`, `social_post`, `recap_output`
- `mediaType`: `photo`, `video`, `social_post`, `recap_video`
- `status`
- `caption`
- `capturedAt`
- `uploadedAt`
- `sourceUrl`
- `storagePath`
- `thumbnailUrl`
- `socialProvider`
- `socialPostUrl`
- `socialAuthorHandle`
- `location`
- `matchedPlaceId`
- `matchedScheduleItemId`
- `matchConfidence`
- `matchReasons`
- `visibleToTrip`
- `eligibleForRecap`
- `createdAt`
- `updatedAt`

`TripMediaApproval`:

- `id`
- `tripId`
- `mediaId`
- `actorUserId`
- `action`: `approve`, `reject`, `hide`, `restore`, `select_for_recap`, `exclude_from_recap`
- `reason`
- `createdAt`

`TripMediaShareSettings`:

- `tripId`
- `userId`
- `sharingMode`
- `allowPhotoLibraryScan`
- `allowVideoCandidates`
- `allowSocialPostSuggestions`
- `autoShareMinConfidence`
- `defaultRecapEligible`
- `createdAt`
- `updatedAt`

## Feed Cards

Trip feed cards should stay simple:

- “You took 12 photos near TeamLab. Add them?”
- “Mia shared 4 photos from dinner.”
- “Jordan added a TikTok from Golden Gai.”
- “7 new approved memories are ready for the recap.”
- “Approve these Bali surf clips for the group feed?”
- “Want a caption for tonight’s Golden Gai photos?”

The feed should not expose raw metadata unless the user opens details.

## Recap Rules

Recap generation should use:

- Shared media.
- Owner-approved private media.
- Media selected for recap.
- Trip schedule and places visited.
- Group attendance context.

Recap generation should avoid:

- Rejected media.
- Hidden media.
- Private candidates.
- Social posts without permission to include.
- Media from outside the trip window/location unless manually selected.

## Build Sequence

1. Add mock media models and fixture cards to trip detail.
2. Add API contracts for media listing, candidate ingestion, approvals, and share settings.
3. Add local in-memory implementation for testing.
4. Add mobile UI for media suggestions and approval actions.
5. Add manual upload support.
6. Add native photo-library scan behind permissions.
7. Add social post link cards.
8. Add social caption/post suggestions for approved media.
9. Add recap candidate selection.
10. Add recap generation.
11. Add provider-specific social imports only when APIs and permissions are stable.

## Test Plan

No device permissions:

- Trip feed still loads mock media cards.
- Share settings show media scanning disabled.

Approval-required mode:

- Candidate media stays private until the owner approves.
- Approved media appears in the group feed.
- Rejected media does not appear in recap candidates.

Auto-share mode:

- Only high-confidence owned media auto-shares.
- Medium/low-confidence media still asks for approval.

Group controls:

- Admin can hide shared media from the group feed.
- Admin cannot approve another user’s private candidate.

Recap:

- Recap candidates include approved media only.
- Excluded media stays out of recap generation.
