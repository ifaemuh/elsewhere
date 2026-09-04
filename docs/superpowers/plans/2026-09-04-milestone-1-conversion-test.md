# Milestone 1: TikTok GO Conversion Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimum tooling needed to run a 30-video experiment that answers one question — do AI-generated travel videos convert to TikTok GO bookings?

**Architecture:** A standalone `packages/golab` workspace holding a JSON-backed
experiment log, a report that computes the kill criterion, and a location-image
generator. Deliberately not a pipeline. Videos are edited by hand; this tooling
only removes the two things that don't scale manually — generating location
imagery, and remembering what happened to 30 videos over three months.

**Tech Stack:** TypeScript, Node 22 `node:test` (stdlib, no test framework
dependency), `tsx` for execution, Replicate for image generation, a plain JSON
file for storage.

## Global Constraints

- **TikTok only.** No Instagram or YouTube code. Neither has a native travel booking rail.
- **Judge on `bookings`, never on `commissionUsd`.** Payout is net-30 from *booking close*, so commission lags posting by 60–120 days. A report that gates on money received would take a quarter to answer.
- **Kill criterion:** 30 videos posted with zero confirmed bookings means the plan changes. This must be encoded in code, not left to judgment.
- **Audio priority is trending/CML first, AI-generated as fallback only.** Recorded per video so the experiment can detect if audio source affects reach.
- **No POI tagging automation.** TikTok exposes no API for it. Tagging stays manual and out of scope for all tooling.
- **Storage is a committed JSON file.** It is the experimental record; it holds no secrets and belongs in git.
- Node >= 22 (repo already uses `@types/node@^22`). Package manager is `npm@11.7.0` with workspaces `apps/*` and `packages/*`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/golab/package.json` | Workspace manifest, scripts, `tsx` dep |
| `packages/golab/tsconfig.json` | TS config extending repo conventions |
| `packages/golab/src/types.ts` | Shared record types. No logic. |
| `packages/golab/src/store.ts` | Load/save the JSON store; pure add functions |
| `packages/golab/src/report.ts` | Aggregation + verdict. Pure, no I/O. |
| `packages/golab/src/visuals.ts` | Replicate location-image generation |
| `packages/golab/src/cli.ts` | Thin arg parsing over the above |
| `packages/golab/data/experiment.json` | The committed experimental record |
| `packages/golab/test/*.test.ts` | `node:test` suites |

Split by responsibility: `store` owns persistence, `report` owns math, `visuals`
owns the network call. `report` never touches disk, which is what makes the
verdict logic trivially testable.

---

### Task 1: Workspace scaffold and the experiment log

**Files:**
- Create: `packages/golab/package.json`
- Create: `packages/golab/tsconfig.json`
- Create: `packages/golab/src/types.ts`
- Create: `packages/golab/src/store.ts`
- Test: `packages/golab/test/store.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `VideoRecord`, `Outcome`, `ExperimentStore`, `Variant` types; `emptyStore()`, `addVideo(store, rec)`, `loadStore(path)`, `saveStore(path, store)`

- [ ] **Step 1: Create the workspace manifest**

`packages/golab/package.json`:

```json
{
  "name": "@elsewhere/golab",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --import tsx --test test/*.test.ts",
    "typecheck": "tsc --noEmit",
    "golab": "tsx src/cli.ts"
  },
  "dependencies": {
    "replicate": "^1.4.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "tsx": "^4.19.2",
    "typescript": "^5.5"
  }
}
```

`packages/golab/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Then install so the workspace is linked:

```bash
npm install
```

- [ ] **Step 2: Define the record types**

`packages/golab/src/types.ts`:

```typescript
export type VisualStyle = 'photoreal' | 'stylized';
export type PoiCategory = 'hotel' | 'attraction' | 'restaurant';
export type AudioSource = 'trending' | 'cml' | 'ai-generated';

export interface Variant {
  visualStyle: VisualStyle;
  poiCategory: PoiCategory;
  /** Free text, e.g. 'question', 'pov', 'list'. Compared as an exact string. */
  hookFormat: string;
}

export interface VideoRecord {
  /** Stable slug, e.g. '001-lisbon-tile-hotel'. */
  id: string;
  /** ISO 8601 date the video was posted. */
  postedAt: string;
  poiName: string;
  /** Expected commission per booking in USD, read from partner.tiktok-go.us. */
  poiCommissionUsd: number;
  variant: Variant;
  audioSource: AudioSource;
  tiktokUrl?: string;
}

export interface Outcome {
  videoId: string;
  /** ISO 8601 date these numbers were read off TikTok. */
  recordedAt: string;
  views: number;
  poiTaps: number;
  /** Confirmed bookings, net of clawbacks. The number the verdict turns on. */
  bookings: number;
  /** Commission actually received. Lags 60-120 days. Never gate on this. */
  commissionUsd: number;
}

export interface ExperimentStore {
  videos: VideoRecord[];
  outcomes: Outcome[];
}
```

- [ ] **Step 3: Write the failing test**

`packages/golab/test/store.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, addVideo } from '../src/store.ts';
import type { VideoRecord } from '../src/types.ts';

const video: VideoRecord = {
  id: '001-lisbon-tile-hotel',
  postedAt: '2026-09-05',
  poiName: 'Hotel Tile Lisbon',
  poiCommissionUsd: 27.5,
  variant: { visualStyle: 'photoreal', poiCategory: 'hotel', hookFormat: 'question' },
  audioSource: 'trending',
};

test('emptyStore starts with no videos and no outcomes', () => {
  const s = emptyStore();
  assert.deepEqual(s, { videos: [], outcomes: [] });
});

test('addVideo appends a record', () => {
  const s = addVideo(emptyStore(), video);
  assert.equal(s.videos.length, 1);
  assert.equal(s.videos[0].poiName, 'Hotel Tile Lisbon');
});

test('addVideo does not mutate the input store', () => {
  const before = emptyStore();
  addVideo(before, video);
  assert.equal(before.videos.length, 0);
});

test('addVideo rejects a duplicate id', () => {
  const s = addVideo(emptyStore(), video);
  assert.throws(() => addVideo(s, video), /already exists/);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd packages/golab && npm test`
Expected: FAIL — cannot resolve `../src/store.ts`

- [ ] **Step 5: Implement the store**

`packages/golab/src/store.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ExperimentStore, VideoRecord, Outcome } from './types.ts';

export function emptyStore(): ExperimentStore {
  return { videos: [], outcomes: [] };
}

export function addVideo(store: ExperimentStore, record: VideoRecord): ExperimentStore {
  if (store.videos.some((v) => v.id === record.id)) {
    throw new Error(`Video id "${record.id}" already exists`);
  }
  return { ...store, videos: [...store.videos, record] };
}

export function loadStore(path: string): ExperimentStore {
  if (!existsSync(path)) return emptyStore();
  return JSON.parse(readFileSync(path, 'utf8')) as ExperimentStore;
}

export function saveStore(path: string, store: ExperimentStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2) + '\n');
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/golab && npm test`
Expected: PASS — 4 tests

- [ ] **Step 7: Commit**

```bash
cd /Users/eapha/Github/elsewhere
git add packages/golab package-lock.json
git commit -m "feat(golab): experiment store for the 30-video conversion test"
```

---

### Task 2: Outcome recording with correction semantics

**Files:**
- Modify: `packages/golab/src/store.ts`
- Test: `packages/golab/test/outcomes.test.ts`

**Interfaces:**
- Consumes: `ExperimentStore`, `Outcome`, `addVideo`, `emptyStore` from Task 1
- Produces: `recordOutcome(store, outcome)`, `latestOutcomes(store)`

Outcomes are read off TikTok repeatedly as bookings accrue over weeks, so the
same `videoId` gets recorded many times. The latest record for a video wins.
Clawbacks arrive as a *lower* `bookings` number than a previous reading, which
must be accepted rather than rejected as invalid.

- [ ] **Step 1: Write the failing test**

`packages/golab/test/outcomes.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, addVideo, recordOutcome, latestOutcomes } from '../src/store.ts';
import type { VideoRecord, Outcome } from '../src/types.ts';

const video: VideoRecord = {
  id: 'v1',
  postedAt: '2026-09-05',
  poiName: 'Hotel Tile Lisbon',
  poiCommissionUsd: 27.5,
  variant: { visualStyle: 'photoreal', poiCategory: 'hotel', hookFormat: 'question' },
  audioSource: 'trending',
};

const reading = (recordedAt: string, bookings: number): Outcome => ({
  videoId: 'v1',
  recordedAt,
  views: 12000,
  poiTaps: 240,
  bookings,
  commissionUsd: bookings * 27.5,
});

test('recordOutcome rejects an outcome for an unknown video', () => {
  assert.throws(() => recordOutcome(emptyStore(), reading('2026-09-10', 1)), /unknown video/i);
});

test('latestOutcomes returns the most recent reading per video', () => {
  let s = addVideo(emptyStore(), video);
  s = recordOutcome(s, reading('2026-09-10', 2));
  s = recordOutcome(s, reading('2026-09-20', 5));
  const latest = latestOutcomes(s);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].bookings, 5);
});

test('a clawback lowering bookings is accepted', () => {
  let s = addVideo(emptyStore(), video);
  s = recordOutcome(s, reading('2026-09-20', 5));
  s = recordOutcome(s, reading('2026-10-01', 3));
  assert.equal(latestOutcomes(s)[0].bookings, 3);
});

test('all readings are retained as history', () => {
  let s = addVideo(emptyStore(), video);
  s = recordOutcome(s, reading('2026-09-10', 2));
  s = recordOutcome(s, reading('2026-09-20', 5));
  assert.equal(s.outcomes.length, 2);
});

test('videos with no outcome yet are absent from latestOutcomes', () => {
  const s = addVideo(emptyStore(), video);
  assert.deepEqual(latestOutcomes(s), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/golab && npm test`
Expected: FAIL — `recordOutcome` is not exported

- [ ] **Step 3: Implement outcome recording**

Append to `packages/golab/src/store.ts`:

```typescript
export function recordOutcome(store: ExperimentStore, outcome: Outcome): ExperimentStore {
  if (!store.videos.some((v) => v.id === outcome.videoId)) {
    throw new Error(`Cannot record outcome for unknown video "${outcome.videoId}"`);
  }
  return { ...store, outcomes: [...store.outcomes, outcome] };
}

/** The most recent reading per video. Later readings supersede earlier ones,
 *  including downward corrections from refund clawbacks. */
export function latestOutcomes(store: ExperimentStore): Outcome[] {
  const byVideo = new Map<string, Outcome>();
  for (const o of store.outcomes) {
    const current = byVideo.get(o.videoId);
    if (!current || o.recordedAt >= current.recordedAt) byVideo.set(o.videoId, o);
  }
  return [...byVideo.values()];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/golab && npm test`
Expected: PASS — 9 tests total

- [ ] **Step 5: Commit**

```bash
git add packages/golab
git commit -m "feat(golab): outcome recording with clawback-tolerant corrections"
```

---

### Task 3: The report and the kill criterion

**Files:**
- Create: `packages/golab/src/report.ts`
- Test: `packages/golab/test/report.test.ts`

**Interfaces:**
- Consumes: `ExperimentStore`, `latestOutcomes` from Tasks 1–2
- Produces: `buildReport(store, target?)` returning `ReportResult`; `VariantStats`

This is the task that makes the experiment worth running. `buildReport` is pure
— it takes a store and returns numbers, touching no disk and no network.

The verdict encodes the spec's kill criterion literally: fewer than the target
number of videos is `insufficient-data`; target reached with zero bookings is
`kill`; target reached with any bookings is `proceed`.

- [ ] **Step 1: Write the failing test**

`packages/golab/test/report.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, addVideo, recordOutcome } from '../src/store.ts';
import { buildReport } from '../src/report.ts';
import type { ExperimentStore, VisualStyle } from '../src/types.ts';

function seed(count: number, bookingsEach: number, style: VisualStyle = 'photoreal'): ExperimentStore {
  let s = emptyStore();
  for (let i = 0; i < count; i++) {
    const id = `v${i}`;
    s = addVideo(s, {
      id,
      postedAt: '2026-09-05',
      poiName: `POI ${i}`,
      poiCommissionUsd: 20,
      variant: { visualStyle: style, poiCategory: 'hotel', hookFormat: 'question' },
      audioSource: 'trending',
    });
    s = recordOutcome(s, {
      videoId: id,
      recordedAt: '2026-09-30',
      views: 1000,
      poiTaps: 100,
      bookings: bookingsEach,
      commissionUsd: bookingsEach * 20,
    });
  }
  return s;
}

test('below the target the verdict is insufficient-data', () => {
  const r = buildReport(seed(29, 5));
  assert.equal(r.verdict, 'insufficient-data');
});

test('target reached with zero bookings is a kill', () => {
  const r = buildReport(seed(30, 0));
  assert.equal(r.verdict, 'kill');
  assert.equal(r.totalBookings, 0);
});

test('target reached with any bookings is proceed', () => {
  const r = buildReport(seed(30, 1));
  assert.equal(r.verdict, 'proceed');
  assert.equal(r.totalBookings, 30);
});

test('the verdict ignores commission, which lags 60-120 days', () => {
  let s = seed(30, 2);
  s = { ...s, outcomes: s.outcomes.map((o) => ({ ...o, commissionUsd: 0 })) };
  const r = buildReport(s);
  assert.equal(r.verdict, 'proceed');
  assert.equal(r.commissionConfirmedUsd, 0);
});

test('rates are computed per variant dimension', () => {
  const r = buildReport(seed(30, 3));
  const photoreal = r.byVisualStyle.find((v) => v.key === 'photoreal');
  assert.ok(photoreal);
  assert.equal(photoreal.videos, 30);
  assert.equal(photoreal.tapRate, 0.1);   // 100 taps / 1000 views
  assert.equal(photoreal.bookRate, 0.03); // 3 bookings / 100 taps
});

test('a variant with no views reports a zero rate rather than NaN', () => {
  let s = emptyStore();
  s = addVideo(s, {
    id: 'v0',
    postedAt: '2026-09-05',
    poiName: 'POI',
    poiCommissionUsd: 20,
    variant: { visualStyle: 'stylized', poiCategory: 'hotel', hookFormat: 'pov' },
    audioSource: 'cml',
  });
  s = recordOutcome(s, {
    videoId: 'v0', recordedAt: '2026-09-30',
    views: 0, poiTaps: 0, bookings: 0, commissionUsd: 0,
  });
  const stats = buildReport(s).byVisualStyle[0];
  assert.equal(stats.tapRate, 0);
  assert.equal(stats.bookRate, 0);
});

test('videos without outcomes do not count toward the target', () => {
  let s = seed(30, 1);
  s = addVideo(s, {
    id: 'unposted',
    postedAt: '2026-09-30',
    poiName: 'POI X',
    poiCommissionUsd: 20,
    variant: { visualStyle: 'photoreal', poiCategory: 'hotel', hookFormat: 'question' },
    audioSource: 'trending',
  });
  assert.equal(buildReport(s).videosMeasured, 30);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/golab && npm test`
Expected: FAIL — cannot resolve `../src/report.ts`

- [ ] **Step 3: Implement the report**

`packages/golab/src/report.ts`:

```typescript
import { latestOutcomes } from './store.ts';
import type { ExperimentStore, Outcome, VideoRecord } from './types.ts';

export const TARGET_VIDEOS = 30;

export interface VariantStats {
  key: string;
  videos: number;
  views: number;
  poiTaps: number;
  bookings: number;
  /** poiTaps / views. Zero when there are no views. */
  tapRate: number;
  /** bookings / poiTaps. Zero when there are no taps. */
  bookRate: number;
}

export type Verdict = 'insufficient-data' | 'kill' | 'proceed';

export interface ReportResult {
  videosMeasured: number;
  totalViews: number;
  totalPoiTaps: number;
  totalBookings: number;
  /** Reported for information only. The verdict never depends on it. */
  commissionConfirmedUsd: number;
  verdict: Verdict;
  byVisualStyle: VariantStats[];
  byPoiCategory: VariantStats[];
  byHookFormat: VariantStats[];
  byAudioSource: VariantStats[];
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function groupBy(
  pairs: Array<[VideoRecord, Outcome]>,
  keyOf: (v: VideoRecord) => string,
): VariantStats[] {
  const buckets = new Map<string, VariantStats>();
  for (const [video, outcome] of pairs) {
    const key = keyOf(video);
    const b = buckets.get(key) ?? { key, videos: 0, views: 0, poiTaps: 0, bookings: 0, tapRate: 0, bookRate: 0 };
    b.videos += 1;
    b.views += outcome.views;
    b.poiTaps += outcome.poiTaps;
    b.bookings += outcome.bookings;
    buckets.set(key, b);
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    tapRate: rate(b.poiTaps, b.views),
    bookRate: rate(b.bookings, b.poiTaps),
  }));
}

export function buildReport(store: ExperimentStore, target = TARGET_VIDEOS): ReportResult {
  const outcomes = latestOutcomes(store);
  const byId = new Map(store.videos.map((v) => [v.id, v]));

  const pairs: Array<[VideoRecord, Outcome]> = [];
  for (const o of outcomes) {
    const v = byId.get(o.videoId);
    if (v) pairs.push([v, o]);
  }

  const totalViews = pairs.reduce((n, [, o]) => n + o.views, 0);
  const totalPoiTaps = pairs.reduce((n, [, o]) => n + o.poiTaps, 0);
  const totalBookings = pairs.reduce((n, [, o]) => n + o.bookings, 0);
  const commissionConfirmedUsd = pairs.reduce((n, [, o]) => n + o.commissionUsd, 0);

  const videosMeasured = pairs.length;
  const verdict: Verdict =
    videosMeasured < target ? 'insufficient-data' : totalBookings === 0 ? 'kill' : 'proceed';

  return {
    videosMeasured,
    totalViews,
    totalPoiTaps,
    totalBookings,
    commissionConfirmedUsd,
    verdict,
    byVisualStyle: groupBy(pairs, (v) => v.variant.visualStyle),
    byPoiCategory: groupBy(pairs, (v) => v.variant.poiCategory),
    byHookFormat: groupBy(pairs, (v) => v.variant.hookFormat),
    byAudioSource: groupBy(pairs, (v) => v.audioSource),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/golab && npm test`
Expected: PASS — 16 tests total

- [ ] **Step 5: Commit**

```bash
git add packages/golab
git commit -m "feat(golab): conversion report with the 30-video kill criterion"
```

---

### Task 4: Location image generation

**Files:**
- Create: `packages/golab/src/visuals.ts`
- Test: `packages/golab/test/visuals.test.ts`

**Interfaces:**
- Consumes: `VisualStyle` from Task 1
- Produces: `buildLocationPrompt(poiName, detail, style)`, `generateLocationImage(poiName, detail, style, deps?)`

Adapted from the output-normalisation logic in `apps/api/lib/ai/replicate.ts`.
It is *copied, not imported* — that file belongs to the shelved app, and this
workspace should not depend on it.

Unlike the app's `generatePersonalizedImage`, there is no reference photo here:
these are location plates, not personalized scenes. The Replicate call is
injected so the prompt logic can be tested without hitting the network.

- [ ] **Step 1: Write the failing test**

`packages/golab/test/visuals.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocationPrompt, generateLocationImage } from '../src/visuals.ts';

test('photoreal prompts ask for editorial photography', () => {
  const p = buildLocationPrompt('Hotel Tile Lisbon', 'rooftop pool at sunset', 'photoreal');
  assert.match(p, /Hotel Tile Lisbon/);
  assert.match(p, /rooftop pool at sunset/);
  assert.match(p, /photorealistic/i);
});

test('stylized prompts ask for illustration instead of photography', () => {
  const p = buildLocationPrompt('Hotel Tile Lisbon', 'rooftop pool', 'stylized');
  assert.match(p, /illustrated/i);
  assert.doesNotMatch(p, /photorealistic/i);
});

test('generateLocationImage returns bytes from a URL output', async () => {
  const buf = await generateLocationImage('POI', 'detail', 'photoreal', {
    run: async () => 'https://example.test/a.jpg',
    fetchImage: async () => Buffer.from('IMAGE'),
  });
  assert.equal(buf.toString(), 'IMAGE');
});

test('generateLocationImage unwraps an array output', async () => {
  const buf = await generateLocationImage('POI', 'detail', 'photoreal', {
    run: async () => ['https://example.test/a.jpg'],
    fetchImage: async (url) => Buffer.from(url),
  });
  assert.equal(buf.toString(), 'https://example.test/a.jpg');
});

test('generateLocationImage rejects an unexpected output shape', async () => {
  await assert.rejects(
    generateLocationImage('POI', 'detail', 'photoreal', {
      run: async () => ({ nope: true }),
      fetchImage: async () => Buffer.from(''),
    }),
    /Unexpected output/,
  );
});

test('the prompt reaches Replicate with a 9:16 aspect ratio', async () => {
  let seen: Record<string, unknown> | undefined;
  await generateLocationImage('Hotel Tile Lisbon', 'rooftop', 'photoreal', {
    run: async (_model, input) => { seen = input; return 'https://example.test/a.jpg'; },
    fetchImage: async () => Buffer.from('X'),
  });
  assert.equal(seen?.aspect_ratio, '9:16');
  assert.match(String(seen?.prompt), /Hotel Tile Lisbon/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/golab && npm test`
Expected: FAIL — cannot resolve `../src/visuals.ts`

- [ ] **Step 3: Implement the generator**

`packages/golab/src/visuals.ts`:

```typescript
import Replicate from 'replicate';
import type { VisualStyle } from './types.ts';

const MODEL = 'black-forest-labs/flux-1.1-pro' as const;

export interface VisualDeps {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
  fetchImage(url: string): Promise<Buffer>;
}

export function buildLocationPrompt(poiName: string, detail: string, style: VisualStyle): string {
  const base = `${detail} at ${poiName}.`;
  return style === 'photoreal'
    ? `${base} Cinematic, photorealistic travel photography. Golden hour lighting, editorial composition, rich detail. Vertical format.`
    : `${base} Bold illustrated travel poster art. Flat graphic shapes, saturated colour, strong silhouette. Vertical format.`;
}

function defaultDeps(): VisualDeps {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');
  const client = new Replicate({ auth: token });
  return {
    run: (model, input) => client.run(model as `${string}/${string}`, { input }),
    fetchImage: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

export async function generateLocationImage(
  poiName: string,
  detail: string,
  style: VisualStyle,
  deps: VisualDeps = defaultDeps(),
): Promise<Buffer> {
  const output = await deps.run(MODEL, {
    prompt: buildLocationPrompt(poiName, detail, style),
    aspect_ratio: '9:16',
    output_format: 'jpg',
    safety_tolerance: 2,
  });

  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string') throw new Error('Unexpected output format from Replicate');
  return deps.fetchImage(url);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/golab && npm test`
Expected: PASS — 22 tests total

- [ ] **Step 5: Commit**

```bash
git add packages/golab
git commit -m "feat(golab): 9:16 location image generation via Replicate"
```

---

### Task 5: CLI wiring

**Files:**
- Create: `packages/golab/src/cli.ts`
- Create: `packages/golab/data/experiment.json`
- Test: manual smoke, verified by the steps below

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces: `golab add-video`, `golab record`, `golab report`, `golab image` commands

This is the only task without unit tests. It is thin argument parsing over
already-tested functions; its logic lives entirely in the modules beneath it.

- [ ] **Step 1: Seed the empty store**

`packages/golab/data/experiment.json`:

```json
{
  "videos": [],
  "outcomes": []
}
```

- [ ] **Step 2: Implement the CLI**

`packages/golab/src/cli.ts`:

```typescript
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, saveStore, addVideo, recordOutcome } from './store.ts';
import { buildReport } from './report.ts';
import { generateLocationImage } from './visuals.ts';
import type { VisualStyle, PoiCategory, AudioSource } from './types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'data', 'experiment.json');

function flag(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : process.argv[i + 1];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

const command = process.argv[2];

if (command === 'add-video') {
  const store = loadStore(STORE);
  saveStore(STORE, addVideo(store, {
    id: flag('id'),
    postedAt: flag('posted', new Date().toISOString().slice(0, 10)),
    poiName: flag('poi'),
    poiCommissionUsd: Number(flag('commission')),
    variant: {
      visualStyle: flag('style') as VisualStyle,
      poiCategory: flag('category') as PoiCategory,
      hookFormat: flag('hook'),
    },
    audioSource: flag('audio') as AudioSource,
    tiktokUrl: flag('url', ''),
  }));
  console.log(`Recorded video ${flag('id')}`);
} else if (command === 'record') {
  const store = loadStore(STORE);
  saveStore(STORE, recordOutcome(store, {
    videoId: flag('id'),
    recordedAt: flag('on', new Date().toISOString().slice(0, 10)),
    views: Number(flag('views')),
    poiTaps: Number(flag('taps')),
    bookings: Number(flag('bookings')),
    commissionUsd: Number(flag('commission', '0')),
  }));
  console.log(`Recorded outcome for ${flag('id')}`);
} else if (command === 'report') {
  const r = buildReport(loadStore(STORE));
  console.log(`\nVerdict: ${r.verdict.toUpperCase()}`);
  console.log(`Videos measured: ${r.videosMeasured}/30`);
  console.log(`Views: ${r.totalViews}  Taps: ${r.totalPoiTaps}  Bookings: ${r.totalBookings}`);
  console.log(`Commission confirmed: $${r.commissionConfirmedUsd.toFixed(2)} (lags 60-120 days; not part of the verdict)`);
  for (const [label, rows] of [
    ['Visual style', r.byVisualStyle], ['POI category', r.byPoiCategory],
    ['Hook format', r.byHookFormat], ['Audio source', r.byAudioSource],
  ] as const) {
    console.log(`\n${label}:`);
    for (const s of rows) {
      console.log(`  ${s.key.padEnd(14)} n=${String(s.videos).padStart(3)}  tap=${(s.tapRate * 100).toFixed(2)}%  book=${(s.bookRate * 100).toFixed(2)}%`);
    }
  }
} else if (command === 'image') {
  const id = flag('id');
  const buf = await generateLocationImage(flag('poi'), flag('detail'), flag('style') as VisualStyle);
  const out = join(ROOT, 'data', 'assets', id);
  mkdirSync(out, { recursive: true });
  const file = join(out, `${Date.now()}.jpg`);
  writeFileSync(file, buf);
  console.log(`Wrote ${file}`);
} else {
  console.log(`Usage:
  golab add-video --id 001-lisbon --poi "Hotel Tile" --commission 27.5 \\
                  --style photoreal --category hotel --hook question --audio trending
  golab record    --id 001-lisbon --views 12000 --taps 240 --bookings 3
  golab report
  golab image     --id 001-lisbon --poi "Hotel Tile" --detail "rooftop pool at sunset" --style photoreal`);
}
```

- [ ] **Step 3: Smoke test the log and report path**

```bash
cd packages/golab
npx tsx src/cli.ts add-video --id smoke-1 --poi "Test POI" --commission 20 \
  --style photoreal --category hotel --hook question --audio trending
npx tsx src/cli.ts record --id smoke-1 --views 1000 --taps 50 --bookings 2
npx tsx src/cli.ts report
```

Expected: `Verdict: INSUFFICIENT-DATA`, `Videos measured: 1/30`, and a
`Visual style` row reading `photoreal n=1 tap=5.00% book=4.00%`.

- [ ] **Step 4: Reset the store after the smoke test**

```bash
cd packages/golab && printf '{\n  "videos": [],\n  "outcomes": []\n}\n' > data/experiment.json
```

- [ ] **Step 5: Ignore generated assets, then commit**

```bash
cd /Users/eapha/Github/elsewhere
echo "packages/golab/data/assets/" >> .gitignore
git add packages/golab .gitignore
git commit -m "feat(golab): CLI for logging videos, outcomes, and the report"
```

---

## Running the experiment

Tooling is not the experiment. Once the five tasks are done, the actual work is:

1. Pull a POI shortlist from `partner.tiktok-go.us`, favouring high-commission
   POIs — a $48 POI and a $7 POI cost the same to produce.
2. For each video: `golab image` for plates, hand-edit in CapCut, post to TikTok,
   **manually add the POI tag**, then `golab add-video`.
3. Weekly: read TikTok analytics and `golab record` each video. Re-record as
   bookings accrue; the latest reading wins and clawbacks are expected.
4. At 30 measured videos, run `golab report` and read the verdict.

Deliberately excluded, per the spec: any render pipeline, any scheduler, any
Instagram work, POI-tagging automation, and AI music generation.

## Self-Review

- **Spec coverage:** Milestone 1's variant dimensions (photoreal vs stylized, POI
  type, hook format) are all captured in `Variant` and reported. The kill
  criterion is `buildReport`'s `kill` verdict. The "judge on bookings, not
  commission" rule is enforced by `verdict` ignoring `commissionUsd` and is
  covered by a dedicated test. The open question about branded-content audio
  classification is captured via `audioSource` and `byAudioSource`.
- **Placeholders:** none. Every code step carries full source.
- **Type consistency:** `VideoRecord`, `Outcome`, `ExperimentStore`, `Variant`,
  `VisualStyle`, `PoiCategory`, and `AudioSource` are defined once in Task 1 and
  used unchanged in Tasks 2–5. `latestOutcomes` is defined in Task 2 and consumed
  by `buildReport` in Task 3 under the same name.
