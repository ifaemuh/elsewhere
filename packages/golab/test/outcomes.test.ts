import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, addVideo, recordOutcome, latestOutcomes } from '../src/store.ts';
import type { VideoRecord, Outcome } from '../src/types.ts';

const video: VideoRecord = {
  id: 'v1',
  postedAt: '2026-09-05',
  poiName: 'SUMMIT One Vanderbilt',
  poiCommissionUsd: 27.5,
  variant: { visualStyle: 'photoreal', poiCategory: 'attraction', hookFormat: 'question' },
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
