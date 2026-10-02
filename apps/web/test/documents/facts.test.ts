import { describe, expect, it } from 'vitest';
import { documentSituation, monthsBetween } from '@/lib/documents/facts';

describe('monthsBetween', () => {
  it('counts whole months toward zero, negative when already expired', () => {
    expect(monthsBetween('2026-11-10', '2027-01-15')).toBe(2);
    expect(monthsBetween('2026-11-10', '2027-02-10')).toBe(3);
    expect(monthsBetween('2026-11-10', '2027-02-09')).toBe(2);
    expect(monthsBetween('2026-11-10', '2026-10-01')).toBe(-1);
  });

  it('treats an expiry before the return date as expired, even inside the same month', () => {
    expect(monthsBetween('2026-11-10', '2026-11-05')).toBe(-1);
    expect(monthsBetween('2026-11-10', '2026-10-15')).toBe(-1);
    expect(monthsBetween('2026-11-10', '2026-11-10')).toBe(0);
  });

  it('rounds month-end conservatively: Jan 31 to Feb 28 is zero whole months', () => {
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(0);
  });
});

describe('documentSituation', () => {
  it('maps a member’s documents to rule facts and leaves unknowns out', () => {
    expect(
      documentSituation({ destinationCountry: 'PT', tripEnd: '2026-11-10', passport: { issuingCountry: 'US', expiresOn: '2027-01-15' }, realIdCompliant: null, domesticFlight: false }),
    ).toEqual({
      'trip.destination_country': 'PT',
      'passenger.nationality': 'US',
      'passenger.passport_months_valid_after_return': 2,
      'flight.is_domestic_us': false,
    });
  });
});
