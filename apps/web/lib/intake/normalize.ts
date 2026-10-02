import type { z } from 'zod';
import type { ExtractedBookingSchema } from './extract';

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

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Free-text fields must never carry passport numbers, birth dates, or loyalty credentials,
 * even if the model copies them in. Drops labelled credentials, dates, and any token holding a run of 5+ digits.
 */
export function scrubSensitive(text: string): string {
  return text
    .replace(/\b(passport|pp|dob|date of birth|birth ?date|born|frequent flyer|ffn?|loyalty|member(ship)?|rewards?|miles)\b[\s:#.-]*\S*/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')
    .split(/\s+/)
    .filter((token) => !/\d{5,}/.test(token) && !/^[A-Za-z]\d{6,}$/.test(token))
    .join(' ')
    .replace(/\s+(#|:|-)\s*$/, '')
    .trim();
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
    if (!LOCAL_DATETIME.test(segment.departure_local)) problems.push(`segment ${n}: departure "${segment.departure_local}" is not a date and time`);
    if (problems.length > 0) segmentsOk = false;
    return {
      carrierIata,
      flightNumber,
      originIata,
      destinationIata,
      departureLocal: segment.departure_local,
      arrivalLocal: segment.arrival_local && LOCAL_DATETIME.test(segment.arrival_local) ? segment.arrival_local : null,
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
  const segmentKey = segments.map((s) => `${s.carrierIata}${s.flightNumber}@${s.departureLocal.slice(0, 10)}`).join(',');
  const dedupeKey = `${confirmationCode ?? 'NOCODE'}|${segmentKey || provider.toUpperCase()}`;

  return {
    kind: raw.kind,
    provider,
    confirmationCode,
    bookedVia: (raw.booked_via && scrubSensitive(raw.booked_via)) || null,
    bookedAt: raw.booked_at && (LOCAL_DATE.test(raw.booked_at) || LOCAL_DATETIME.test(raw.booked_at)) ? raw.booked_at : null,
    passengerNames,
    segments,
    confidence: segmentsOk ? confidence : 0,
    dedupeKey,
    problems,
  };
}
