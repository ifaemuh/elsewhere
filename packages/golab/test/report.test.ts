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
      variant: { visualStyle: style, poiCategory: 'attraction', hookFormat: 'question' },
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
  assert.equal(buildReport(seed(29, 5)).verdict, 'insufficient-data');
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
  assert.equal(photoreal.tapRate, 0.1);
  assert.equal(photoreal.bookRate, 0.03);
});

test('a variant with no views reports a zero rate rather than NaN', () => {
  let s = emptyStore();
  s = addVideo(s, {
    id: 'v0',
    postedAt: '2026-09-05',
    poiName: 'POI',
    poiCommissionUsd: 20,
    variant: { visualStyle: 'stylized', poiCategory: 'attraction', hookFormat: 'pov' },
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
    variant: { visualStyle: 'photoreal', poiCategory: 'attraction', hookFormat: 'question' },
    audioSource: 'trending',
  });
  assert.equal(buildReport(s).videosMeasured, 30);
});
