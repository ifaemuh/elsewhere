# TikTok GO Video Templates

**Date:** 2026-09-04
**Companion to:** `docs/superpowers/specs/2026-09-04-travel-content-engine-design.md`

Four templates for the milestone-1 conversion test. Every one obeys the same
constraints, so the templates are the only variable.

## Constants across all four

| | |
|---|---|
| Length | **12–20s** (peak-virality band; ~80%+ completion achievable) |
| Hook | Fully landed **before 0:03** — clearing 40% past 3s roughly doubles downstream conversion |
| POI | **Exactly one per video.** Attribution needs a single tag. |
| Goal | **Desire and a tap.** Not saves. Save-bait listicles win reach and lose bookings. |
| Venue footage | **Real.** AI generates surrounding b-roll, never the tagged venue. |
| AI disclosure | **AIGC toggle on.** Proactive labelling costs far less reach than a retroactive flag. |
| Inventory | Sub-$80 tours/attractions/restaurants (Viator, GetYourGuide, Tiqets) |
| Audio | Trending sound, 10k–200k videos of usage |

---

## T1 — The Reveal

Desire-led. Withhold, then deliver.

```
0:00-0:02  Tight, ambiguous detail. Texture, not context.
           Text: "you'd never guess what this is"
0:02-0:07  Pull back / whip to the full reveal. The money shot.
0:07-0:14  2-3 fast cuts of the best features. No narration.
0:14-0:18  Text: "it's [POI] — tap the tag"
```

**Hook formulas:** "you'd never guess what this is" · "wait for it" ·
"this costs less than you think"

**Best for:** visually dramatic POIs. **Tests:** whether pure visual desire converts.
**Risk:** the withhold costs you viewers before 0:03 if the detail shot is boring.

---

## T2 — The Number

Price-led. Directly exploits the sub-$80 conversion threshold.

```
0:00-0:02  Full-frame text, flat statement: "$38."
           No preamble, no build.
0:02-0:11  Rapid cuts of exactly what $38 buys. 4-5 shots.
0:11-0:16  Text: "[POI], $38, tap to book"
```

**Hook formulas:** "$38." · "this is $38 and people pay $200 for worse" ·
"cheapest thing I did in [city]"

**Best for:** anything under $80. **Tests:** whether stating price up front raises tap
rate — the most direct read on the price-conversion finding.
**Risk:** reads as an ad, which suppresses organic reach.

---

## T3 — POV

UGC-native. The extreme end of the rough axis.

```
0:00-0:03  Handheld walk-in. No title card. Ambient audio under the trending sound.
           Text (small, corner): "[city] · $40"
0:03-0:14  One near-continuous shot. Minimal cuts. Imperfect framing is the point.
0:14-0:18  Turn toward the thing. Text: "tap the tag"
```

**Hook formulas:** no text hook at all — the hook is the motion ·
"ok this was worth it" · "nobody told me about this"

**Best for:** experiences with a walk-in moment. **Tests:** the polished-vs-rough
axis at its extreme. If T3 beats T1, roughness matters more than production value.
**Risk:** hardest to fake with generated footage; needs the most real material.

---

## T4 — The Correction

Tension-led. Engineered for comments, which feed the distribution ladder.

```
0:00-0:03  Text over a recognisable landmark: "don't do [famous thing]"
0:03-0:06  Cut. Text: "do this instead"
0:06-0:15  The alternative. Why it's better. Fast.
0:15-0:20  Text: "[POI] — tap the tag"
```

**Hook formulas:** "don't do [X], do this" · "everyone goes to [X]. go here." ·
"[X] is a tourist trap and here's the fix"

**Best for:** cities with an obvious over-touristed default.
**Tests:** whether controversy-driven comment volume translates into taps or just noise.
**Risk:** attracts arguers who comment without tapping. High engagement, possibly low intent.

---

## Experiment design

30 videos across 4 templates and 2 finishes is 8 cells of ~4 videos — far too thin
to conclude anything per cell. Run it sequentially instead.

**Phase A — videos 1–16.** Four templates x 4 videos each, all the same finish.
Rank by tap rate. Carry the top 2 forward.

**Phase B — videos 17–30.** Top 2 templates x polished/rough, ~3-4 videos per cell.

**What this can and cannot detect:** with n this small the test answers *"does AI
travel content convert to bookings at all"* — the kill criterion. It does **not**
reliably rank a template that is 15% better than another. Treat template ranking as
a steer, not a result.

## CapCut beat-sync recipe

Trending sounds are licensed inside TikTok and cannot be imported into an arbitrary
editor. CapCut is ByteDance and pulls TikTok sounds directly, so the cut happens
there.

1. Favourite the sound in TikTok (spinning record -> Add to Favorites).
2. CapCut -> new project -> **Audio -> TikTok -> Favorites** -> add the sound.
3. Tap **Beat -> Auto-generate** to place beat markers.
4. Snap every hard cut to a marker. The 0:03 hook boundary should land on a beat.
5. Export, upload to TikTok, re-select the same sound in-app so it registers as the
   trending sound rather than embedded audio, then **add the POI tag** and post.

Step 5 is the one that earns money. A video posted without the POI tag earns nothing
no matter how it performs.

`beat-this` / `madmom` from the Stemmies stack can extract a grid for planning shot
lengths before you open CapCut, but CapCut's auto-beat is where the cut lands.

---

## Sourcing real POI footage

The binding constraint. AI cannot depict a specific tagged venue, so every
bookable video needs real media of the actual place. Ranked by value.

| # | Source | Cost | Legal standing | Scales? |
|---|---|---|---|---|
| 1 | **Ask the operator directly** | Free | Written permission | Yes, ~1hr outreach per city |
| 2 | **Viator / GYG Partner API images** | Free w/ affiliate | ⚠️ **Unconfirmed** | Yes |
| 3 | **Own contact shooting (NYC)** | Free | Owned outright | No — one city |
| 4 | **License creator UGC** | Per clip | Written license | Partly |
| 5 | **TikTok Stitch / Duet** | Free | Built-in attribution | Yes, but fights the templates |
| 6 | **Stock footage** | Subscription | ⚠️ Editorial-only trap | Yes |
| 7 | **DMO media libraries** | Free | ⚠️ **Noncommercial** | Yes |

**1 — Ask the operator.** Tours and attractions listed on GYG/Viator are small
businesses that want marketing. A direct message asking for footage or permission
to use their existing social clips converts well and yields written permission plus
media of the exact venue being tagged. Do this first for every POI.

**2 — Partner API images unlock the slideshow format.** Viator's affiliate tier
grants access to content endpoints (product images, descriptions). "Photo slideshow
compilations with trending audio" is one of the highest-performing 2026 travel
formats, so real listing photos + Ken Burns + trending sound is a complete video
with no filming. **Confirm usage rights with partner support before relying on
this** — content-endpoint access is not the same as a licence to republish in social
video. Unverified as of 2026-09-04.

**3 — NYC-only is a feature.** It satisfies the 80% niche rule, NYC is a top-GMV
market so per-POI commission runs higher, and it is the one real-footage source
under direct control. `NYC things to do under $80` is a tighter, more legible niche
than any broader alternative.

### Traps

- **DMO libraries are noncommercial.** NYC Tourism + Conventions maintains a real
  five-borough B-roll library, but licensed for *noncommercial* promotional use by
  media and travel professionals. Affiliate commission is commercial use. Request
  written creator permission rather than assuming.
- **Most landmark stock is editorial-only** — no property release, so commercial use
  is excluded. Filter for **Commercial + Property Released**, and note that generic
  city b-roll still fails the "must depict the tagged POI" requirement.
