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
  golab add-video --id 001-summit --poi "SUMMIT One Vanderbilt" --commission 27.5 \\
                  --style photoreal --category attraction --hook question --audio trending
  golab record    --id 001-summit --views 12000 --taps 240 --bookings 3
  golab report
  golab image     --id 001-summit --poi "SUMMIT One Vanderbilt" --detail "mirrored room at dusk" --style photoreal`);
}
