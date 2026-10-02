import { existsSync, statSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const cwd = process.cwd();
const sourceFiles = [
  'packages/shared/src/constants/demo-media.ts',
  'apps/mobile/app/(tabs)/discover.tsx',
  'apps/mobile/app/(tabs)/trip/[id].tsx',
  'apps/api/lib/trips/mock-trip-room.ts',
];

const mediaPattern = /\/api\/v1\/local-assets\/[^'"`\s)]+/g;
const registryLocalPattern = /local\('([^']+)'\)/g;
const expectedTypes = new Map([
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.mp4', 'video/mp4'],
]);

function resolveLocalAsset(url) {
  const relative = url.replace('/api/v1/local-assets/', '');
  const [bucket, ...rest] = relative.split('/');
  const root = ['brand', 'editorial', 'trips'].includes(bucket)
    ? join(cwd, 'apps/api/mock-assets')
    : join(cwd, 'apps/api/.data/storage');
  return {
    bucket,
    path: join(root, bucket, ...rest),
  };
}

const urls = new Set();
for (const file of sourceFiles) {
  const abs = join(cwd, file);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, 'utf8');
  for (const match of text.matchAll(mediaPattern)) {
    if (match[0].includes('${')) continue;
    urls.add(match[0]);
  }
  for (const match of text.matchAll(registryLocalPattern)) {
    urls.add(`/api/v1/local-assets/${match[1]}`);
  }
}

const failures = [];
const rows = [];
for (const url of [...urls].sort()) {
  if (url.includes('/previews/dev-user-000/')) {
    failures.push(`${url} uses quarantined preview output storage`);
    continue;
  }

  const resolved = resolveLocalAsset(url);
  const ext = extname(resolved.path).toLowerCase();
  const expectedType = expectedTypes.get(ext);
  if (!expectedType) {
    failures.push(`${url} has unsupported extension ${ext || '(none)'}`);
    continue;
  }
  if (!existsSync(resolved.path)) {
    failures.push(`${url} is missing at ${resolved.path}`);
    continue;
  }
  const stat = statSync(resolved.path);
  if (stat.size <= 0) {
    failures.push(`${url} is empty`);
    continue;
  }
  rows.push({ url, contentType: expectedType, size: stat.size });
}

const tripFile = readFileSync(join(cwd, 'apps/mobile/app/(tabs)/trip/[id].tsx'), 'utf8');
if (tripFile.includes('/api/v1/local-assets/editorial/')) {
  failures.push('Trip Detail references editorial assets directly instead of the trip media registry');
}

const discoverFile = readFileSync(join(cwd, 'apps/mobile/app/(tabs)/discover.tsx'), 'utf8');
const bannedDiscoverLabels = [
  'AI VIDEO',
  'AI PHOTO',
  'AI TRIP CARD',
  'Partner Rate',
  'Still view',
  'pre-rendered',
  'preview scenes',
  'ready preview',
  'fixture',
  'placeholder',
  'displayMediaKind',
  'previewTopRow',
  'previewPeopleRow',
  'Possible trip moments',
];

for (const label of bannedDiscoverLabels) {
  if (discoverFile.toLowerCase().includes(label.toLowerCase())) {
    failures.push(`Discover contains banned prototype label/content: ${label}`);
  }
}

if (!discoverFile.includes('personalizedStillForDestination')) {
  failures.push('Discover personal cards are not wired to the approved personalized still registry');
}

if (!discoverFile.includes('ParticipantRow')) {
  failures.push('Discover personal-card participants are not rendered below media');
}

const corruptReference = join(cwd, 'apps/api/.data/storage/reference-photos/dev-user-000/4ad01941-30b6-411f-93c0-8b2442d2f304.webp');
if (existsSync(corruptReference)) {
  rows.push({
    url: 'reference-photo excluded: 4ad01941-30b6-411f-93c0-8b2442d2f304.webp',
    contentType: 'excluded from demo manifests',
    size: statSync(corruptReference).size,
  });
}

if (failures.length) {
  console.error('Media audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Media audit passed for ${rows.length} local assets.`);
for (const row of rows) {
  console.log(`${row.contentType.padEnd(31)} ${String(row.size).padStart(8)}  ${row.url}`);
}
