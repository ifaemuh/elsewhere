# Mobile Preview Validation

The next milestone is to prove the mobile AI wedge:

> Can a user capture a selfie on mobile and get back a personalized travel preview that actually resembles them?

Do not treat booking, financing, or sharing as validated until this works.

## Local Dev Setup

The easiest path is the one-command launcher:

```sh
cd /Users/eapha/Github/elsewhere
npm run dev:mobile-preview
```

The script starts the API with local stores, writes `apps/mobile/.env.local` with the correct `EXPO_PUBLIC_API_URL`, starts Expo, and prints a phone URL like:

```txt
http://YOUR_LAN_IP:3002/mobile-test
```

Open that URL on your phone, then tap `Open in Expo Go`.

If you prefer manual terminals, use the steps below.

Run the API with local stores so the mobile app can use dev auth while still loading provider keys from the API `.env` file:

```sh
cd apps/api
ELSEWHERE_USE_LOCAL_STORES=true npm run dev
```

Run the mobile app separately:

```sh
cd apps/mobile
npm run dev
```

For a physical phone, `apps/mobile/.env` must point at the dev machine LAN URL:

```sh
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3002
```

For iOS simulator, the default `http://localhost:3002` is fine. For Android emulator, the app falls back to `http://10.0.2.2:3002`.

## Validation Flow

1. Open the mobile app.
2. Confirm Discover shows `API: connected`.
3. Pick a destination.
4. Pick a scene, such as a night market, temple morning, cafe table, surf sunset, or sailing day.
5. Tap `Add your selfie`.
6. Capture several reference photos: one clear face selfie, one half-body shot, and one full-body shot if possible.
7. Save the photos and confirm the thumbnails appear on Discover. The app sends the three newest saved references to each preview job.
8. Add identity notes if needed, for example `Black man with glasses, short hair`.
9. Accept likeness consent.
10. Tap `Generate Personalized Preview`.
11. Wait for the preview job to finish.
12. Confirm the result screen shows the reference photo used, then inspect the output for:
    - recognizable facial likeness
    - natural body/face placement
    - convincing scene-specific activity
    - no obvious artifacts or identity drift
    - good enough output to share

## Pass/Fail Criteria

Pass:

- Upload works from mobile.
- Job completes without backend errors.
- Output resembles the user.
- Output feels shareable enough for the product wedge.

Fail:

- Upload fails from mobile.
- Preview job fails before generation.
- Replicate returns generic/non-likeness output.
- Result is too uncanny or low-quality to share.

## Mock Assist Flow

After preview validation, test the trip intelligence wedge:

1. Open the `Trips` tab.
2. Review the seeded mock trips and their savings/protected-value totals.
3. Open a trip to inspect:
   - monitored flight and hotel segments
   - savings opportunities
   - cancellation/refund/credit impact
   - rule citations explaining why an action is allowed
4. Tap `Run Intelligence Check` to refresh the monitor and decision timestamp.
5. Open the `Assist` tab to see all active opportunities across trips.
6. From a generated preview, tap `Plan This Trip`, complete mock checkout, and confirm it lands in the active trip guide.

This is not live airline or hotel integration yet. The goal is to test whether the product story is understandable: Elsewhere knows the rules, watches the trip, and tells you the best allowed action.

The `Assist` tab also includes `Deal Radar`. In local mode it uses fixture-backed deal/error-fare samples, optional allowlisted RSS feeds, and clear source confidence labels. Public deal signals are not booking-specific truth; they must be verified through official providers before changing a trip.

The trip detail page also shows `Data Sources`. Add provider credentials in `apps/api/.env` to move sources from `missing credentials` to `connected`:

- `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET`
- `DUFFEL_ACCESS_TOKEN`
- `FLIGHTAWARE_API_KEY`
- `EXPEDIA_RAPID_API_KEY` / `EXPEDIA_RAPID_SHARED_SECRET`
- `HOTELBEDS_API_KEY` / `HOTELBEDS_SECRET`
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`
- `SERPAPI_API_KEY` or `TAVILY_API_KEY` for public policy research fallback
- `AI_GATEWAY_API_KEY` for AI-ranked Assist decisions
- `ELSEWHERE_ENABLE_DEFAULT_DEAL_FEEDS=true` to enable allowlisted Secret Flying / The Flight Deal RSS fetches
- `ELSEWHERE_DEAL_FEED_URLS` for comma-separated allowlisted RSS URLs

## If It Fails

Debug in this order:

1. API connection and `EXPO_PUBLIC_API_URL`.
2. Reference photo upload route.
3. Consent record creation.
4. Preview job creation with `referencePhotoIds`.
5. Reference photo handoff to Replicate.
6. Replicate model/prompt quality.

In local-store mode, the API sends uploaded image bytes to Replicate instead of a `localhost` URL. In hosted mode, the API sends the storage public URL.
