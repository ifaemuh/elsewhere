import { describe, expect, it } from 'vitest';
import { CONFIDENCE_THRESHOLD, normalizeBooking } from '@/lib/intake/normalize';
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
    expect(booking.dedupeKey).toBe('ABC123|TP204@2026-11-03');
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
});
