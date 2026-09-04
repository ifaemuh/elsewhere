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
