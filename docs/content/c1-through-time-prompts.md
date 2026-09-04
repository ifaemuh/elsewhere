# C1 — NYC Through Time: Prompt Set

**Date:** 2026-09-04
**Render:** silent, 1080x1920, 5 shots x 3.2s = 16s. Audio attached in-app at post.

## What the Times Square test taught

The demo render exposed a failure mode worth designing around: **AI cannot render
legible text.** The "today" frame produced `WELES THE FRE IS YOU GHUNG` across a
billboard, and the 1904 frame included an anachronistic traffic light.

Times Square *is* signage, which makes it the worst possible location for this
concept. Every episode below is chosen for **architecture and landscape over
text** — subjects where garbled lettering has nowhere to appear.

## Consistency technique

The morph only reads if the vantage point holds across eras. Every prompt in an
episode repeats a **fixed composition clause verbatim**, and varies only the
era-specific detail. Do not paraphrase the clause between frames.

---

## Episode 1 — Brooklyn Bridge

**Why it works:** pure structure. Cables, towers, river. No signage anywhere.

**Fixed clause** (paste into every prompt):
`Shot from the wooden pedestrian promenade at the center of the Brooklyn Bridge, looking toward the Manhattan tower, gothic arches framing the view, cables converging overhead, vertical composition.`

| # | Era | Era-specific detail to prepend |
|---|---|---|
| 1 | 1883 | `Opening year 1883. Men in top hats and women in bustled dresses walking the promenade, horse carts on the roadway below, low brick skyline beyond, hazy sepia daylight.` |
| 2 | 1910 | `The year 1910. Early motor cars mixing with horse carts, men in flat caps, coal smoke haze, the Woolworth Building rising in the distance.` |
| 3 | 1945 | `The year 1945. Soldiers in uniform among the crowd, wartime newspapers, mid-century skyline, hard afternoon light and long shadows.` |
| 4 | 1978 | `The year 1978. Graffiti on the railings, gritty film grain, faded colour, blocky 1970s skyline, overcast and washed out.` |
| 5 | today | `Present day. Tourists with phones raised, joggers, the modern glass skyline including One World Trade, crisp golden hour light.` |

**Overlay copy:** `Brooklyn Bridge, 1883` → `1910` → `1945` → `1978` → `today`
**Closing card:** `same walk. 140 years.`

---

## Episode 2 — Grand Central Terminal

**Why it works:** the strongest single interior in New York, and the concourse is
almost entirely stone, glass, and light. The zodiac ceiling anchors every frame.

**Fixed clause:**
`Interior of Grand Central Terminal main concourse, shot from the east balcony looking down and across at the great arched windows, the constellation ceiling visible above, shafts of light cutting through the hall, vertical composition.`

| # | Era | Era-specific detail to prepend |
|---|---|---|
| 1 | 1913 | `Opening year 1913. Pristine new stonework, men in three-piece suits and homburgs, porters with luggage carts, warm gaslight glow.` |
| 2 | 1930 | `The year 1930. Dense commuter crowd in overcoats, dramatic sunbeams through the windows, sharp black and white contrast with faint colour.` |
| 3 | 1954 | `The year 1954. Mid-century travellers, families in bright coats, a vast advertising mural on the east wall, saturated Kodachrome colour.` |
| 4 | 1975 | `The year 1975. Soot-darkened ceiling, dim bulbs, sparse weary commuters, brown and amber palette, heavy grain.` |
| 5 | today | `Present day. Restored cream and gold ceiling, tourists photographing upward, clean bright light, modern clothing.` |

**Overlay copy:** `Grand Central, 1913` → `1930` → `1954` → `1975` → `today`
**Closing card:** `they almost demolished it in 1975.`

> The closing card is factually true and is the strongest comment hook in the set.

---

## Episode 3 — Coney Island Boardwalk

**Why it works:** sky, sea, timber, and rides. Silhouettes carry the era; nothing
depends on readable lettering.

**Fixed clause:**
`Standing on the Coney Island boardwalk looking down its length toward the parachute jump and the wooden roller coaster, ocean to one side, weathered timber planks receding into the distance, vertical composition.`

| # | Era | Era-specific detail to prepend |
|---|---|---|
| 1 | 1905 | `The year 1905. Crowds in full-length bathing costumes and straw boaters, early wooden amusement structures, bright hazy sea light.` |
| 2 | 1925 | `The year 1925. Packed summer crowd, cloche hats and striped swimsuits, the new steel parachute tower, vivid sunlit colour.` |
| 3 | 1950 | `The year 1950. Families with umbrellas and coolers, chrome and neon ride frames, saturated postwar colour.` |
| 4 | 1985 | `The year 1985. Half the rides shuttered and rusting, empty stretches of boardwalk, bleached colour, heavy grain, overcast.` |
| 5 | today | `Present day. Restored boardwalk, modern crowds, the parachute jump lit in colour against a dusk sky.` |

**Overlay copy:** `Coney Island, 1905` → `1925` → `1950` → `1985` → `today`
**Closing card:** `the parachute jump hasn't run since 1968.`

---

## Rules for every episode

1. **Repeat the fixed clause verbatim.** Paraphrasing breaks the vantage point and
   the morph stops reading as one place.
2. **Never choose a signage-heavy location.** No Times Square, no storefronts, no
   marquees. Garbled text is the format's main failure mode.
3. **Check anachronisms before posting.** The 1904 test frame contained a modern
   traffic light. Regenerate rather than ship a frame the comments will correct.
4. **AIGC toggle on.** Every frame is generated.
5. **Silent render.** Sound is attached in the TikTok app at post time.
6. **Closing card carries the hook.** Episodes 2 and 3 end on a true fact, which is
   what earns the comment rather than the view.
