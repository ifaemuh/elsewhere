// Extraction accuracy on real, consented, redacted confirmations kept OUTSIDE the repo.
//   AI_GATEWAY_API_KEY=... npm run eval:extraction -- ~/elsewhere-evals/extraction
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ExtractionInput } from '@/lib/intake/extract';
import type { NormalizedBooking } from '@/lib/intake/normalize';

const TARGET = 0.95;
const SEGMENT_FIELDS = ['carrierIata', 'flightNumber', 'originIata', 'destinationIata', 'departureLocal'] as const;

const USAGE = `Usage: AI_GATEWAY_API_KEY=<key> npm run eval:extraction -- <dir>
  <dir>  a folder of cases, one subfolder each: input.json, the files it names, and expected.json
         (the data lives outside the repo, for example ~/elsewhere-evals/extraction)
This calls the live extraction model through AI Gateway and spends credit.`;

function usage(problem: string): never {
  console.error(`${problem}\n\n${USAGE}`);
  process.exit(2);
}

const dirArg = process.argv[2];
if (!dirArg) usage('No case directory given.');
if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) usage('AI_GATEWAY_API_KEY is not set.');
const root = path.resolve(dirArg.replace(/^~/, homedir()));
if (!existsSync(root) || !statSync(root).isDirectory()) usage(`${root} is not a directory.`);

// Loaded only after the arguments check out, so a bad invocation never touches the model code.
const { extractBookings } = await import('@/lib/intake/extract');
const { CONFIDENCE_THRESHOLD } = await import('@/lib/intake/normalize');

interface ExpectedBooking {
  kind: NormalizedBooking['kind'];
  confirmationCode: string | null;
  passengerNames: string[];
  segments: Pick<NormalizedBooking['segments'][number], (typeof SEGMENT_FIELDS)[number]>[];
}

const MEDIA: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function loadInput(dir: string): ExtractionInput {
  const raw = JSON.parse(readFileSync(path.join(dir, 'input.json'), 'utf8')) as { text: string | null; html: string | null; files?: string[] };
  const input: ExtractionInput = { text: raw.text, html: raw.html, images: [], pdfs: [] };
  for (const file of raw.files ?? []) {
    const mediaType = MEDIA[path.extname(file).toLowerCase()];
    if (!mediaType) throw new Error(`${dir}: unsupported file ${file}`);
    const data = new Uint8Array(readFileSync(path.join(dir, file)));
    (mediaType === 'application/pdf' ? input.pdfs : input.images).push({ data, mediaType });
  }
  return input;
}

const names = (list: string[]) => list.map((n) => n.toUpperCase().replace(/\s+/g, ' ').trim()).sort().join(' | ');

/** Field by field; every miss is [field, expected, actual]. */
function compare(expected: ExpectedBooking, actual: NormalizedBooking | undefined): { total: number; misses: [string, string, string][] } {
  const misses: [string, string, string][] = [];
  const check = (field: string, want: string | null, got: string | null | undefined) => {
    if ((want ?? '') !== (got ?? '')) misses.push([field, want ?? '∅', got ?? '∅']);
  };
  check('kind', expected.kind, actual?.kind);
  check('confirmationCode', expected.confirmationCode, actual?.confirmationCode);
  check('passengerNames', names(expected.passengerNames), actual ? names(actual.passengerNames) : null);
  expected.segments.forEach((segment, i) => {
    for (const key of SEGMENT_FIELDS) check(`segments[${i}].${key}`, segment[key], actual?.segments[i]?.[key]);
  });
  return { total: 3 + expected.segments.length * SEGMENT_FIELDS.length, misses };
}

const cases = readdirSync(root).filter((name) => statSync(path.join(root, name)).isDirectory()).sort();
if (cases.length === 0) usage(`No cases in ${root}.`);

let total = 0;
let correct = 0;
let silent = 0;
for (const name of cases) {
  const dir = path.join(root, name);
  const expected = JSON.parse(readFileSync(path.join(dir, 'expected.json'), 'utf8')) as ExpectedBooking[];
  // extractBookings returns the bookings and any attachment problems; only the bookings are scored.
  const { bookings: actual, problems } = await extractBookings(loadInput(dir));
  if (problems.length > 0) console.log(`note    ${name}: ${problems.join('; ')}`);
  for (const [index, want] of expected.entries()) {
    const got = actual.find((b) => want.confirmationCode !== null && b.confirmationCode === want.confirmationCode) ?? actual[index];
    const { total: fields, misses } = compare(want, got);
    total += fields;
    correct += fields - misses.length;
    for (const [field, w, g] of misses) {
      // A miss the planner is asked to confirm is caught; a confident miss is silent.
      const caught = !got || got.confidence < CONFIDENCE_THRESHOLD || got.problems.length > 0;
      if (!caught) silent += 1;
      console.log(`${caught ? 'caught' : 'SILENT'}  ${name} #${index} ${field}: expected ${w}, got ${g}`);
    }
  }
  if (actual.length > expected.length) console.log(`extra   ${name}: ${actual.length - expected.length} booking(s) not in expected.json`);
}

const accuracy = correct / total;
console.log(`\n${cases.length} cases · ${correct}/${total} fields · accuracy ${(accuracy * 100).toFixed(1)}% (target ${TARGET * 100}%)`);
console.log(`${silent} silent miss(es): wrong yet confident, so they skip planner confirmation`);
process.exitCode = accuracy >= TARGET ? 0 : 1;
