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
