# Preview, Video, And Recap Roadmap

## Goal

Elsewhere should prove a simple emotional claim first:

```text
See yourself there before you go.
```

Then it should complete the loop after the trip:

```text
See what actually happened after you went.
```

## Mobile Preview Validation

The first product proof is not broad booking coverage. It is whether the mobile app can generate a personalized destination preview that clearly resembles the user.

Validation checklist:

- User can capture or upload reference photos on mobile.
- Reference photos persist so the user does not need to retake photos every time.
- The app can use several references: clear face selfie, half-body shot, and full-body shot.
- The generated output preserves the user’s identity, skin tone, age range, gender presentation, body shape, and overall look.
- The destination and activity are recognizable.
- The output is good enough to share.
- The flow works on the phone, not only in a web harness.

If the result changes the user into someone else, the preview is not successful even if the image looks good.

## Reference Library

Profile should eventually own the reusable reference library:

- Face references.
- Half-body references.
- Full-body references.
- Group/friend references.
- Consent status.
- Delete/export controls.
- Clear explanation of how photos are used.

Discover should use the library when generating previews, with the option to add or retake references inline.

## Destination Scene Library

Each destination should have multiple scene/activity presets instead of one generic image prompt.

Examples:

- Tokyo night market.
- Tokyo temple morning.
- Tokyo listening bar.
- Bali rice terrace sunrise.
- Bali surf sunset.
- Paris cafe morning.
- Paris museum night.
- Santorini sailing day.
- Santorini cliffside dinner.

Scene presets should include:

- Activity.
- Time of day.
- Mood.
- Camera framing.
- Wardrobe guidance.
- Destination-specific details.
- Social export format hints.

This keeps previews from feeling like generic AI travel posters.

## Video Preview Testing

Video is still worth testing because it strengthens the viral loop.

Sora or other video providers can be integrated experimentally behind backend-only routes and feature flags. The app should not expose provider keys on-device.

Testing posture:

- Backend-only video generation.
- Feature flag disabled by default.
- Clear cost/time limits.
- Store generation IDs and outputs.
- Show still-image fallback if video generation fails.
- Do not depend on video for the core booking flow until quality, latency, cost, and API access are stable.

Fallback path:

- Generate a high-quality still preview.
- Animate it into a 9:16 motion preview with pan/zoom, text overlay, watermark, and music-ready timing.
- Export/share through native social surfaces.

## Recap Loop

The recap belongs in Trips.

After a trip ends, the completed trip surface should generate or offer a recap treatment using real trip media:

- Native photo library items matched by date/location.
- Approved group media.
- Social posts the user chooses to include.
- Places visited.
- Activities completed.
- Trip route and schedule.
- Favorite moments.

Media ingestion and approval details live in [TRIP_MEDIA_FEED_API_PLAN.md](TRIP_MEDIA_FEED_API_PLAN.md). Recaps should use approved or explicitly selected media, not private candidates.

The recap should mirror the original preview:

```text
Then: Elsewhere imagined you in Tokyo.
Now: Elsewhere shows the Tokyo you actually lived.
```

Completed recaps should live:

- At the top of the completed/past trip card.
- Inside the completed trip surface as the first memory/status treatment.
- Under `Trips -> Past`.
- Optionally in Profile as broader travel history.

Recap should be part of the completed trip’s presentation, not a separate standalone trip card.

Sharing should be optional and user-controlled. Elsewhere can suggest captions or post copy from the recap, but publishing should remain an explicit user action through native share/social surfaces.

## Product Loop

The full loop:

```text
AI preview -> quote -> split/pay/book -> active trip feed -> real media -> recap video -> social sharing -> next trip
```

The preview is the promise. The trip feed is the experience. The recap is the proof.
