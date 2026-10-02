import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { ExtractedBookingSchema } from './extract';
import { splitName } from './passengers';

export const CONFIDENCE_THRESHOLD = 0.9;

export interface NormalizedSegment {
  carrierIata: string;
  flightNumber: string;
  originIata: string;
  destinationIata: string;
  departureLocal: string;
  arrivalLocal: string | null;
}

export interface NormalizedBooking {
  kind: 'flight' | 'hotel' | 'rental' | 'car' | 'rail' | 'activity';
  provider: string;
  confirmationCode: string | null;
  bookedVia: string | null;
  /** When the booking was made, as printed: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */
  bookedAt: string | null;
  passengerNames: string[];
  segments: NormalizedSegment[];
  confidence: number;
  dedupeKey: string;
  problems: string[];
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

function realDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** A calendar date that exists ("2026-13-45" does not). */
export function isRealDate(value: string): boolean {
  const m = LOCAL_DATE.exec(value);
  return Boolean(m) && realDate(+m![1], +m![2], +m![3]);
}

/** A local date-time that exists, "YYYY-MM-DDTHH:mm". */
export function isRealDateTime(value: string): boolean {
  const m = LOCAL_DATETIME.exec(value);
  return Boolean(m) && realDate(+m![1], +m![2], +m![3]) && +m![4] < 24 && +m![5] < 60;
}

/**
 * Free-text fields must never carry passport numbers, birth dates, or loyalty credentials,
 * even if the model copies them in. Drops dates, long digit runs (spaces and hyphens allowed),
 * labelled credentials (only when a number follows the label), and any token holding 5+ digits.
 */
export function scrubSensitive(text: string): string {
  return text
    .replace(new RegExp(`\\b\\d{1,2}\\s?(${MONTHS})[a-z]*\\.?,?\\s?\\d{2,4}\\b`, 'gi'), ' § ')
    .replace(new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{2,4}\\b`, 'gi'), ' § ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' § ')
    .replace(/\d(?:[ -]?\d){4,}/g, '§')
    .replace(/\b(passport|pp|dob|date of birth|birth ?date|born|frequent flyer|ffn?|loyalty|member(ship)?|rewards?|miles)\b[\s:#.-]*(?=\S*[\d§])\S*/gi, ' ')
    .split(/\s+/)
    .filter((token) => !token.includes('§') && !/\d{5,}/.test(token) && !/^[A-Za-z]\d{6,}$/.test(token))
    .join(' ')
    .replace(/\s+(#|:|-)\s*$/, '')
    .trim();
}

const compact = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Model confidence is not trusted: injected text can make it claim certainty about invented fields.
 * With a text body, the code, every flight number, and every passenger surname must appear in it, else cap at 0.5.
 * With only an image or PDF, there is nothing to check against, so cap below the auto-accept threshold.
 */
export function groundBooking(booking: NormalizedBooking, sourceText: string | null): NormalizedBooking {
  const problems = [...booking.problems];
  let confidence = booking.confidence;
  if (sourceText === null) {
    confidence = Math.min(confidence, 0.85);
    problems.push('read from an image or document only; needs a person to confirm');
    return { ...booking, confidence, problems };
  }
  const source = compact(sourceText);
  let grounded = true;
  if (booking.confirmationCode && !source.includes(compact(booking.confirmationCode))) {
    grounded = false;
    problems.push('confirmation code is not in the message text');
  }
  booking.segments.forEach((segment, index) => {
    if (!new RegExp(`${compact(segment.carrierIata)}0*${segment.flightNumber}`).test(source)) {
      grounded = false;
      problems.push(`segment ${index + 1}: flight number is not in the message text`);
    }
  });
  for (const name of booking.passengerNames) {
    const { first, last } = splitName(name);
    const surname = compact(last || first);
    if (surname && !source.includes(surname)) {
      grounded = false;
      problems.push('a passenger surname is not in the message text');
      break;
    }
  }
  if (!grounded) confidence = Math.min(confidence, 0.5);
  return { ...booking, confidence, problems };
}

const PROVIDER_NOISE = new Set(['air', 'airline', 'airlines', 'airways', 'inc', 'llc', 'ltd', 'co', 'the']);

function normalizeProvider(provider: string): string {
  return provider
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !PROVIDER_NOISE.has(word))
    .join(' ');
}

function buildDedupeKey(
  kind: string,
  code: string | null,
  provider: string,
  names: string[],
  bookedAt: string | null,
  segments: NormalizedSegment[],
): string {
  const segmentKey = segments
    .map((s) => `${s.carrierIata}${s.flightNumber}@${s.departureLocal.slice(0, 10)}`)
    .sort()
    .join(',');
  if (segmentKey) return `${kind}|${code ?? 'NOCODE'}|${segmentKey}`;
  const normalizedProvider = normalizeProvider(provider);
  if (code) return `${kind}|${code}|${normalizedProvider}`;
  const fingerprint = [normalizedProvider, ...names.map(compact).sort(), bookedAt ?? ''].join('|');
  return `${kind}|NOCODE|${createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)}`;
}

export function normalizeBooking(raw: z.infer<typeof ExtractedBookingSchema>): NormalizedBooking {
  const problems: string[] = [];
  let segmentsOk = true;
  const segments = raw.segments.map((segment, index) => {
    const n = index + 1;
    const carrierIata = segment.carrier_iata.trim().toUpperCase();
    const flightNumber = segment.flight_number.trim().replace(/^0+(?=\d)/, '');
    const originIata = segment.origin_iata.trim().toUpperCase();
    const destinationIata = segment.destination_iata.trim().toUpperCase();
    if (!/^[A-Z0-9]{2}$/.test(carrierIata)) problems.push(`segment ${n}: carrier "${segment.carrier_iata}" is not an airline code`);
    if (!/^\d{1,4}$/.test(flightNumber)) problems.push(`segment ${n}: flight number "${segment.flight_number}" is not numeric`);
    if (!/^[A-Z]{3}$/.test(originIata)) problems.push(`segment ${n}: origin "${segment.origin_iata}" is not an airport code`);
    if (!/^[A-Z]{3}$/.test(destinationIata)) problems.push(`segment ${n}: destination "${segment.destination_iata}" is not an airport code`);
    if (!isRealDateTime(segment.departure_local)) problems.push(`segment ${n}: departure "${segment.departure_local}" is not a date and time`);
    if (problems.length > 0) segmentsOk = false;
    return {
      carrierIata,
      flightNumber,
      originIata,
      destinationIata,
      departureLocal: segment.departure_local,
      arrivalLocal: segment.arrival_local && isRealDateTime(segment.arrival_local) ? segment.arrival_local : null,
    };
  });

  const confirmationCode = raw.confirmation_code ? raw.confirmation_code.trim().toUpperCase() : null;
  const passengerNames = raw.passenger_names.map(scrubSensitive).filter(Boolean);
  const provider = scrubSensitive(raw.provider);
  const groups = [
    confirmationCode ? raw.confidence.confirmation_code : 0.5,
    passengerNames.length > 0 ? raw.confidence.passengers : 0,
    raw.kind === 'flight' ? (segmentsOk && segments.length > 0 ? raw.confidence.segments : 0) : raw.confidence.segments,
  ];
  const confidence = Math.max(0, Math.min(1, Math.min(...groups)));
  const bookedAt = raw.booked_at && (isRealDate(raw.booked_at) || isRealDateTime(raw.booked_at)) ? raw.booked_at : null;
  if (raw.booked_at && !bookedAt) problems.push('booking time is not a real date');
  const dedupeKey = buildDedupeKey(raw.kind, confirmationCode, provider, passengerNames, bookedAt, segments);

  return {
    kind: raw.kind,
    provider,
    confirmationCode,
    bookedVia: (raw.booked_via && scrubSensitive(raw.booked_via)) || null,
    bookedAt,
    passengerNames,
    segments,
    confidence: segmentsOk ? confidence : 0,
    dedupeKey,
    problems,
  };
}
