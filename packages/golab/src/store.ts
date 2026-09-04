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
