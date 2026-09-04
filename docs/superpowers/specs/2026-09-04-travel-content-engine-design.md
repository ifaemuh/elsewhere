# Travel Content Engine — Design

**Date:** 2026-09-04
**Status:** Draft, pending review

## Goal

Build a semi-automated pipeline that produces and publishes AI-generated travel
short-form video to **TikTok only**, monetized through **TikTok GO** POI booking
commissions.

Instagram and YouTube are out of scope: neither has a native travel booking
integration, so both would be audience channels with no monetization rail.

Success is measured in bookings, not views.

## Context

- Money clock is 1–3 months. This project is the *compounding asset*, not the
  income. Contract work covers the near-term gap (tracked separately).
- TikTok GO launched 2026-05-12, US-wide, no invite. Booking partners:
  Booking.com, Expedia, Viator, GetYourGuide, Tiqets, Trip.com.
- Commissions run ~$7–48 per booking, ~5% average, set per POI by TikTok.
- Elsewhere (the native travel app) is shelved. Its AI preview generator is
  salvaged as the visual asset factory; nothing else carries over.

## How TikTok GO pays (researched 2026-09-04)

Attribution is **not** affiliate links. TikTok binds an attribution token to the
POI tag and tracks it natively. No link management, no landing page, and no
third-party cookie dependency.

| | |
|---|---|
| POI catalog | `partner.tiktok-go.us` |
| Attribution window | 7-day click (ACC + TTD verticals) |
| Confirmation | Actual order/fulfillment data, not self-reported clicks |
| Clawbacks | Refunds and cancellations reverse commission automatically |
| Rate | Set per-POI by TikTok; ~5% historical average |
| Example | $550 hotel AOV x ~5% = ~$27.50 per booking |
| Payout | Net-30 from *booking close* |
| Entity | Paid as an individual; personal bank account, no LLC |
| Tax | >$600/yr triggers 1099-MISC |

**Cash-flow consequence:** booking close follows the stay, not the booking.
Realistic lag from posting to money received is **60-120 days**. This project
cannot service a 1-3 month income need. Contract work covers that; this is the
compounding asset. Treat that as settled, not open.

**Sourcing caveat:** the most detailed mechanics above come from an agency's own
recruiting site, which claims creators keep 100% of commission while agencies
earn via TikTok's GMV incentive program. Plausible but self-serving. Verify
directly at `partner.tiktok-go.us` before signing with any agency.

## Hard constraints (researched 2026-09-04)

These shape the architecture and are not negotiable.

1. **No API for POI tagging.** TikTok exposes no endpoint to attach a POI to a
   video. An untagged video earns zero commission. The revenue-generating action
   is manual, in-app, permanently.
2. **Direct posting requires audit.** `video.publish` needs a 2–4 week TikTok
   audit. Until it passes, every API post is forced `SELF_ONLY` (private).
   `video.upload` needs no audit and delivers to the account's drafts.
3. **Audio is a distribution lever, not a content slot.** Trending sounds
   measurably improve FYP placement when used early in their cycle. Original
   AI-generated music forfeits that advantage for no gain. Commercial/branded
   content is additionally restricted to TikTok's Commercial Music Library, and
   whether TikTok GO content is classified as branded is unresolved.
4. **Unoriginal-content policy.** Both platforms demote/demonetize mass-produced
   AI content. Volume without a distinctive hand is a classification risk.

**Consequence:** the pipeline terminates at a TikTok draft. A human completes
POI tag + publish, ~30 seconds per video. Design for that, don't fight it.

## Architecture

Seven stages. Each is independently runnable and testable, communicating through
a job record in Postgres.

```
POI select -> Visual gen -> Audio gen -> Render -> Metadata -> Draft push -> Track
                                                                    |
                                                          [HUMAN: POI tag + post]
```

### 1. POI selection
Chooses which hotel/attraction/restaurant to make a video about, ranked by TikTok
GO commission rate and booking volume. Highest-leverage stage: a $48 POI and a $7
POI cost the same to produce.
**Depends on:** TikTok GO POI data (manual seed list initially).

### 2. Visual generation
AI-generated location imagery/video. Reuses Elsewhere's existing Replicate
wiring (FLUX-Kontext, Gemini).
**Interface:** `(poi, shot_list) -> [asset_uri]`

### 3. Audio selection
**Trending / Commercial Music Library audio first.** Reach beats originality
here. AI generation via Stemmies `musicgen` is the *fallback only*, for when the
library has nothing usable for a given video.

Beat grid extraction (`beat-this` / `madmom`) stays regardless — caption sync
needs it whether the audio is licensed or generated.

**Interface:** `(mood, duration) -> (audio_ref, beat_grid)`
**Licensing:** posts stay on-platform, so no distribution rights are needed.
Nothing here is published to Spotify or Apple Music.

### 4. Render
Vertical 1080x1920 composite: visuals + audio + beat-synced captions.
**Interface:** `(assets, audio, beat_grid, caption_script) -> video_uri`
**Reference:** MoneyPrinterTurbo for the ffmpeg composition approach.

### 5. Metadata
LLM-generated hook, caption, hashtags. Must include the POI name so the human
step is unambiguous.
**Interface:** `(poi, video_uri) -> {hook, caption, hashtags, poi_reminder}`

### 6. Draft push
Publishes to TikTok drafts via Postiz using `video.upload` scope. A human then
adds the POI tag and posts. The user has confirmed manual steps are acceptable.
**Do not build a scheduler.** Postiz owns this layer.
Instagram is out of scope; TikTok drafts are the only publish target.

### 7. Tracking
Records views, taps, bookings, and commission per video. Feeds stage 1 ranking.
This is the only stage that answers the actual business question.

## Milestone 1: the 30-video conversion test

Before any of the above is fully automated, answer the one question that decides
whether the business exists:

**Do AI-generated location videos convert to bookings?**

- 30 videos over 2 weeks, produced with maximum manual effort and minimum tooling.
- Vary: photoreal vs. stylized, POI type, hook format.
- Measure: views -> POI taps -> bookings -> commission.
- Also answers, for free: whether TikTok GO content is treated as branded
  content and thus restricted to the Commercial Music Library.

Because payout lags 60-120 days, judge this test on **bookings confirmed**, not
commission received. Waiting for cash would take a quarter.

**Kill criterion:** if 30 videos produce zero bookings, AI-generated travel
content does not convert and the plan changes. Do not build stages 1–7 before
this passes.

The risk is real: someone booking a hotel usually wants to see the actual place.

## Testing

- Stages 2–5 are pure functions over fixtures; test with golden-file comparison
  on a small POI set.
- Stage 6 tested against Postiz in a sandbox account before touching real ones.
- Stage 7 is the integration test — a video whose commission cannot be traced
  back to its job record is a bug.

## Error handling

- Every stage writes its job record before and after. A crashed run resumes from
  the last completed stage rather than regenerating.
- Rate-limit errors (IG 25–50/24h) back off and requeue rather than dropping.
- A render that fails validation (wrong aspect, no audio, captions off-beat)
  never reaches the draft queue.

## Explicitly out of scope

- Building a scheduler (Postiz).
- Instagram and YouTube entirely - no native travel booking rail exists on
  either, so there is nothing to monetize against.
- AI music as a primary audio source, and any music distribution (Spotify,
  Apple Music). Posts are TikTok-only.
- Building a video editor UI.
- Elsewhere's booking, financing, wallet, and assist features.
- The AI-music faceless account and the vocal-tag remix idea — parked. The
  vocal-tag concept is dropped entirely: the tag is the borrowed IP, and
  AI-generating around it doesn't fix that.
- Any attempt to automate the POI tag. It cannot be done via API, and
  device-farm workarounds are a ban vector.

## Open questions

1. Where does TikTok GO POI commission data come from at scale? Manual seed list
   works for milestone 1; stage 1 ranking needs a real source.
2. How many accounts before TikTok flags coordinated behavior? Unknown, and
   getting it wrong costs the accounts.
3. Is TikTok GO content classified as branded content? If so, audio is limited
   to the Commercial Music Library. Answered by milestone 1.
4. Are agencies actually optional, and does the creator truly keep 100%? Verify
   at `partner.tiktok-go.us` rather than trusting agency marketing.
