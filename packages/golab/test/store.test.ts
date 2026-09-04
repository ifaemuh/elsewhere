import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, addVideo } from '../src/store.ts';
import type { VideoRecord } from '../src/types.ts';

const video: VideoRecord = {
  id: '001-summit-one-vanderbilt',
  postedAt: '2026-09-05',
  poiName: 'SUMMIT One Vanderbilt',
  poiCommissionUsd: 27.5,
  variant: { visualStyle: 'photoreal', poiCategory: 'attraction', hookFormat: 'question' },
  audioSource: 'trending',
};

test('emptyStore starts with no videos and no outcomes', () => {
  const s = emptyStore();
  assert.deepEqual(s, { videos: [], outcomes: [] });
});

test('addVideo appends a record', () => {
  const s = addVideo(emptyStore(), video);
  assert.equal(s.videos.length, 1);
  assert.equal(s.videos[0].poiName, 'SUMMIT One Vanderbilt');
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
