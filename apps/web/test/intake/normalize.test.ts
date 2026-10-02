import { describe, expect, it } from 'vitest';
import { CONFIDENCE_THRESHOLD, groundBooking, normalizeBooking, scrubSensitive } from '@/lib/intake/normalize';
import { ExtractedBookingSchema } from '@/lib/intake/extract';

const raw = {
  kind: 'flight' as const,
  provider: 'TAP Air Portugal',
  confirmation_code: ' abc123 ',
  booked_via: null,
  booked_at: '2026-10-01',
  passenger_names: ['DOE/PAT MR', 'JONES/SAMANTHA MS'],
  segments: [{ carrier_iata: 'tp', flight_number: '0204', origin_iata: 'ewr', destination_iata: 'lis', departure_local: '2026-11-03T18:15', arrival_local: '2026-11-04T06:35' }],
  confidence: { confirmation_code: 0.98, passengers: 0.95, segments: 0.97 },
};

describe('normalizeBooking', () => {
  it('cleans codes and builds a stable dedupe key', () => {
    const booking = normalizeBooking(raw);
    expect(booking.confirmationCode).toBe('ABC123');
    expect(booking.segments[0]).toEqual({ carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', destinationIata: 'LIS', departureLocal: '2026-11-03T18:15', arrivalLocal: '2026-11-04T06:35' });
    expect(booking.dedupeKey).toBe('flight|ABC123|TP204@2026-11-03');
    expect(booking.bookedAt).toBe('2026-10-01');
    expect(booking.confidence).toBe(0.95);
    expect(booking.confidence >= CONFIDENCE_THRESHOLD).toBe(true);
  });

  it('keeps a booking time only when it is a date or a local date-time, and never lowers confidence for it', () => {
    expect(normalizeBooking({ ...raw, booked_at: '2026-10-01T09:30' }).bookedAt).toBe('2026-10-01T09:30');
    const unreadable = normalizeBooking({ ...raw, booked_at: 'last Tuesday' });
    expect(unreadable.bookedAt).toBeNull();
    expect(unreadable.confidence).toBe(0.95);
  });

  it('zeroes confidence for fields that fail validation', () => {
    const booking = normalizeBooking({ ...raw, segments: [{ ...raw.segments[0], origin_iata: 'Newark', departure_local: 'Nov 3' }] });
    expect(booking.confidence).toBe(0);
    expect(booking.problems).toContain('segment 1: origin "Newark" is not an airport code');
  });

  it('drops passport numbers, birth dates, and loyalty numbers from free-text fields', () => {
    const booking = normalizeBooking({
      ...raw,
      provider: 'TAP Air Portugal FF 123456789',
      booked_via: 'Expedia loyalty #A99887766',
      passenger_names: ['DOE/PAT MR Passport X1234567', 'JONES/SAMANTHA MS DOB 1980-04-02', 'Lee Kim born 04/02/1980', 'Ray Cho 998877665'],
    });
    expect(booking.passengerNames).toEqual(['DOE/PAT MR', 'JONES/SAMANTHA MS', 'Lee Kim', 'Ray Cho']);
    expect(booking.provider).toBe('TAP Air Portugal');
    expect(booking.bookedVia).toBe('Expedia');
    expect(JSON.stringify(booking)).not.toMatch(/X1234567|1980|123456789|A99887766|998877665/);
  });

  it('has no schema fields for passport, birth date, or loyalty credentials', () => {
    const keys = Object.keys(ExtractedBookingSchema.shape).join(' ').toLowerCase();
    expect(keys).not.toMatch(/passport|birth|dob|loyalty|frequent|member/);
  });

  it('rejects dates that do not exist', () => {
    const booking = normalizeBooking({ ...raw, booked_at: '2026-13-45', segments: [{ ...raw.segments[0], departure_local: '2026-02-30T10:00' }] });
    expect(booking.bookedAt).toBeNull();
    expect(booking.problems).toContain('booking time is not a real date');
    expect(booking.confidence).toBe(0);
    expect(normalizeBooking({ ...raw, booked_at: '2026-10-01T25:00' }).bookedAt).toBeNull();
  });

  it('keeps names that merely look like credential labels', () => {
    expect(scrubSensitive('Miles Davis')).toBe('Miles Davis');
    expect(scrubSensitive('Max Born')).toBe('Max Born');
    expect(scrubSensitive('Pat Member')).toBe('Pat Member');
    expect(scrubSensitive('Pat Doe miles 12345')).toBe('Pat Doe');
  });

  it('scrubs spaced and hyphenated digit runs and month-name birth dates', () => {
    expect(scrubSensitive('Ray Cho 123 456 789')).toBe('Ray Cho');
    expect(scrubSensitive('Ray Cho 123-456-789')).toBe('Ray Cho');
    expect(scrubSensitive('Ray Cho DOB 12 MAR 1985')).toBe('Ray Cho');
    expect(scrubSensitive('Ray Cho March 3, 1985')).toBe('Ray Cho');
    expect(scrubSensitive('Ray Cho 12MAR85')).toBe('Ray Cho');
  });
});

describe('dedupeKey', () => {
  const stay = { ...raw, kind: 'hotel' as const, segments: [], provider: 'Hotel Avenida', confirmation_code: null };
  const second = { ...raw.segments[0], flight_number: '0300', departure_local: '2026-11-10T09:00' };

  it('includes the kind', () => {
    expect(normalizeBooking({ ...raw, kind: 'rail' }).dedupeKey.startsWith('rail|')).toBe(true);
  });

  it('does not depend on segment order', () => {
    const a = normalizeBooking({ ...raw, segments: [raw.segments[0], second] }).dedupeKey;
    const b = normalizeBooking({ ...raw, segments: [second, raw.segments[0]] }).dedupeKey;
    expect(a).toBe(b);
  });

  it('keeps two code-less stays apart and the same stay together', () => {
    const one = normalizeBooking({ ...stay, booked_at: '2026-09-01' }).dedupeKey;
    expect(one).toBe(normalizeBooking({ ...stay, provider: ' hotel  AVENIDA ', booked_at: '2026-09-01' }).dedupeKey);
    expect(one).not.toBe(normalizeBooking({ ...stay, booked_at: '2026-09-02' }).dedupeKey);
    expect(one).not.toBe(normalizeBooking({ ...stay, provider: 'Hotel Baixa', booked_at: '2026-09-01' }).dedupeKey);
    expect(one).not.toBe(normalizeBooking({ ...stay, booked_at: '2026-09-01', passenger_names: ['SMITH/TERRY'] }).dedupeKey);
  });

  it('ignores airline suffixes in the provider when a non-flight has a code', () => {
    const a = normalizeBooking({ ...stay, confirmation_code: 'Q1', provider: 'Avis Inc.' }).dedupeKey;
    expect(a).toBe(normalizeBooking({ ...stay, confirmation_code: 'q1', provider: 'avis' }).dedupeKey);
  });
});

describe('groundBooking', () => {
  const booking = normalizeBooking(raw);
  const email = 'Booking ABC 123 for DOE/PAT MR and Samantha Jones, flight TP 204 EWR to LIS.';

  it('keeps confidence when everything is in the text', () => {
    expect(groundBooking(booking, email).confidence).toBe(0.95);
  });

  it('caps confidence when the code, a flight, or a surname is missing', () => {
    expect(groundBooking(booking, email.replace('ABC 123', 'XYZ 999')).confidence).toBe(0.5);
    expect(groundBooking(booking, email.replace('TP 204', 'TP 999')).confidence).toBe(0.5);
    const missing = groundBooking(booking, email.replace('Jones', 'Smith'));
    expect(missing.confidence).toBe(0.5);
    expect(missing.problems).toContain('a passenger surname is not in the message text');
  });

  it('caps image or PDF only input below the threshold', () => {
    const result = groundBooking(booking, null);
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('does not crash on regex-significant flight data, and treats it as ungrounded', () => {
    for (const bad of ['(204)', '[']) {
      const b = normalizeBooking({ ...raw, segments: [{ ...raw.segments[0], flight_number: bad, carrier_iata: bad === '[' ? '[' : 'TP' }] });
      const result = groundBooking(b, 'ABC123 DOE JONES TP 204 (204) [');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    }
  });

  it('matches flight numbers on a boundary, with spacing and leading zeros', () => {
    const b = normalizeBooking(raw);
    expect(groundBooking(b, 'ABC123 DOE JONES TP 204').confidence).toBe(0.95);
    expect(groundBooking(b, 'ABC123 DOE JONES TP0204').confidence).toBe(0.95);
    expect(groundBooking(b, 'ABC123 DOE JONES tp204').confidence).toBe(0.95);
    expect(groundBooking(b, 'ABC123 DOE JONES TP2040').confidence).toBe(0.5);
  });

  it('records a problem when arrival is not a real time', () => {
    const b = normalizeBooking({ ...raw, segments: [{ ...raw.segments[0], arrival_local: '2026-02-30T10:00' }] });
    expect(b.segments[0].arrivalLocal).toBeNull();
    expect(b.problems).toContain('segment 1: arrival is not a real date and time');
    expect(b.confidence).toBe(0.95);
  });
});
