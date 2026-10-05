import { matchRules } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { buildSituation, EU261_DISTANCE_THRESHOLDS_KM, type ItinerarySegment, type ObservedFlight, type SituationInput } from '@/lib/assist/situation';
import { answerValue } from '@/lib/assist/questions';

const R = 6371;
const lonFor = (km: number) => ((km / R) * 180) / Math.PI;
const C: Record<string, string> = { AAA: 'FR', BBB: 'DE', JFK: 'US', LIS: 'PT', EWR: 'US', ORD: 'US', MAD: 'ES', BCN: 'ES', SJU: 'PR', STT: 'VI', AMS: 'NL' };
const leg = (carrierIata: string, o: string, d: string, out: string | null, inn: string | null, operatorIata: string | null = carrierIata): ItinerarySegment => ({
  carrierIata, operatorIata, originIata: o, destinationIata: d, originCountry: C[o] ?? null, destinationCountry: C[d] ?? null, scheduledOut: out, scheduledIn: inn,
});
type Extra = Partial<{ type: SituationInput['event']['type']; observed: ObservedFlight[]; offers: ItinerarySegment[][]; airports: SituationInput['airports']; answers: SituationInput['answers']; detectedAt: string; distanceKm: number }>;
const sit = (flight: ItinerarySegment, segments: ItinerarySegment[], extra: Extra = {}) =>
  buildSituation({
    event: { type: extra.type ?? 'delay', delayMinutes: null, detectedAt: extra.detectedAt ?? '2026-11-01T12:00:00Z', observed: extra.observed ?? [], offers: extra.offers ?? [] },
    segment: { ...flight, distanceKm: extra.distanceKm ?? null },
    booking: { bookedVia: null, bookedAt: null, segments },
    airports: extra.airports ?? {},
    answers: extra.answers ?? {},
  });
const obs = (change: Partial<ObservedFlight> = {}): ObservedFlight => ({ observedAt: '2026-11-01T10:00:00Z', cancelled: false, diverted: false, scheduledOut: null, estimatedOut: null, actualOut: null, scheduledIn: null, ...change });

const tpOut = leg('TP', 'EWR', 'LIS', '2026-11-03T23:15:00Z', '2026-11-04T06:35:00Z');
const feeder = leg('UA', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z');

describe('1: a return within 24 hours is its own journey', () => {
  const out = leg('UA', 'LIS', 'JFK', '2026-11-07T10:00:00Z', '2026-11-07T18:00:00Z');
  const back = leg('UA', 'JFK', 'LIS', '2026-11-08T14:00:00Z', '2026-11-08T21:00:00Z');
  const airports = { LIS: { latitude: 38.7813, longitude: -9.13592 }, JFK: { latitude: 40.6413, longitude: -73.7781 } };
  it('keeps the return alone, and sets single_ticket only for a journey of several flights', () => {
    const s = sit(back, [out, back], { airports });
    expect(s).toMatchObject({ 'trip.journey_departs_eu': false, 'trip.journey_arrives_eu': true, 'flight.distance_km': 5404 });
    expect(s).not.toHaveProperty('flight.single_ticket');
    expect(sit(out, [out, back], { airports })).toMatchObject({ 'trip.journey_departs_eu': true, 'trip.journey_arrives_eu': false });
  });
});

describe('2 and 10: departure delay', () => {
  it('is unset for a diverted flight that left 5 minutes late', () => {
    const observed = [obs({ diverted: true, scheduledOut: tpOut.scheduledOut, estimatedOut: tpOut.scheduledOut, actualOut: '2026-11-03T23:20:00Z' })];
    expect(sit(tpOut, [tpOut], { observed })).not.toHaveProperty('event.departure_delay_minutes');
  });
  it('is unset when AeroAPI re-timed the flight by an hour or more, and set below that', () => {
    const retimed = (hours: number) => [obs({ scheduledOut: new Date(Date.parse(tpOut.scheduledOut!) + hours * 3_600_000).toISOString(), estimatedOut: '2026-11-04T01:00:00Z' })];
    expect(sit(tpOut, [tpOut], { observed: retimed(1) })).not.toHaveProperty('event.departure_delay_minutes');
    expect(sit(tpOut, [tpOut], { observed: retimed(0.5) })['event.departure_delay_minutes']).toBe(105);
  });
});

describe('3: offers', () => {
  const cancel = (offers: ItinerarySegment[][], segments = [tpOut], flight = tpOut) => sit(flight, segments, { type: 'cancellation', offers });
  it('P4: an offer with an unknown departure leaves both reroute facts unset', () => {
    const known = [leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z')];
    const unknownOut = [leg('TP', 'EWR', 'LIS', null, '2026-11-04T07:35:00Z')];
    const s = cancel([known, unknownOut]);
    expect(s).not.toHaveProperty('event.reroute_departs_early_minutes');
    expect(s).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('P5: a non-contiguous offer (MAD then BCN) leaves the arrival unset but still measures the departure', () => {
    const offer = [leg('IB', 'EWR', 'MAD', '2026-11-03T23:00:00Z', '2026-11-04T06:00:00Z'), leg('VY', 'BCN', 'LIS', '2026-11-04T06:00:00Z', '2026-11-04T07:30:00Z')];
    const s = cancel([offer]);
    expect(s['event.reroute_departs_early_minutes']).toBe(15);
    expect(s).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('P6: a re-timed feeder does not count as the departure; the flight from the origin airport does', () => {
    const offer = [leg('UA', 'ORD', 'EWR', '2026-11-03T17:30:00Z', '2026-11-03T20:00:00Z'), leg('TP', 'EWR', 'LIS', '2026-11-04T00:15:00Z', '2026-11-04T07:35:00Z')];
    expect(cancel([offer], [feeder, tpOut])).toMatchObject({ 'event.reroute_departs_early_minutes': 0, 'event.reroute_arrival_delay_minutes': 60 });
  });
  it('an offer with no flight from the origin airport leaves the departure unset', () => {
    const offer = [leg('IB', 'JFK', 'LIS', '2026-11-04T00:00:00Z', '2026-11-04T07:00:00Z')];
    expect(cancel([offer])).not.toHaveProperty('event.reroute_departs_early_minutes');
  });
  it('P6b: a zero-minute connection does not hold, and 30 minutes does', () => {
    const change = (scheduledIn: string) => {
      const o = [obs({ scheduledOut: '2026-11-03T20:45:00Z', estimatedOut: '2026-11-03T20:45:00Z', scheduledIn })];
      return sit(feeder, [feeder, tpOut], { type: 'schedule_change', observed: o });
    };
    const zero = change('2026-11-03T23:15:00Z');
    expect(zero['event.reroute_departs_early_minutes']).toBe(0);
    expect(zero).not.toHaveProperty('event.reroute_arrival_delay_minutes');
    expect(change('2026-11-03T22:45:00Z')['event.reroute_arrival_delay_minutes']).toBe(0);
  });
});

describe('4: distances near the EU261 bands stay unset', () => {
  const journey = (km: number) => {
    const airports = { AAA: { latitude: 0, longitude: 0 }, BBB: { latitude: 0, longitude: lonFor(km) } };
    const f = leg('AF', 'AAA', 'BBB', '2026-11-03T08:00:00Z', '2026-11-03T10:00:00Z');
    return sit(f, [f], { airports, distanceKm: km });
  };
  it('names the thresholds', () => expect(EU261_DISTANCE_THRESHOLDS_KM).toEqual([1500, 3500]));
  it.each([1500.4, 1504.9, 1493, 3510])('leaves %s km unset', (km) => {
    expect(journey(km)).not.toHaveProperty('flight.distance_km');
    expect(journey(km)).not.toHaveProperty('flight.leg_distance_km');
  });
  it.each([1490, 1510, 3480, 3520])('sets %s km as whole km', (km) => {
    expect(journey(km)).toMatchObject({ 'flight.distance_km': km, 'flight.leg_distance_km': km });
  });
});

describe('5: carrier facts come from the operator, three-valued', () => {
  const carriers = (marketing: string, operator: string | null) => {
    const f = leg(marketing, 'SJU', 'STT', '2026-11-03T12:00:00Z', '2026-11-03T12:40:00Z', operator);
    return sit(f, [f]);
  };
  it('Cape Air 9K is a U.S. carrier', () => expect(carriers('9K', '9K')).toMatchObject({ 'flight.carrier_is_us': true, 'flight.carrier_is_eu': false, 'trip.booked_with_us_carrier': true }));
  it('Transavia TO is an EU carrier', () => expect(carriers('TO', 'TO')).toMatchObject({ 'flight.carrier_is_eu': true, 'flight.carrier_is_us': false }));
  it('a KL-numbered flight operated by DL is a U.S. carrier, not an EU one', () =>
    expect(carriers('KL', 'DL')).toMatchObject({ 'flight.carrier_iata': 'DL', 'flight.carrier_is_us': true, 'flight.carrier_is_eu': false }));
  it('an unknown operator, U2, DY, LX, or no operator leaves the carrier facts unset', () => {
    for (const code of ['ZZ', 'U2', 'DY', 'LX', null]) {
      const s = carriers('AF', code);
      expect(s, String(code)).not.toHaveProperty('flight.carrier_is_us');
      expect(s, String(code)).not.toHaveProperty('flight.carrier_is_eu');
    }
  });
  it('a known non-U.S., non-EU operator is neither', () => expect(carriers('BA', 'BA')).toMatchObject({ 'flight.carrier_is_us': false, 'flight.carrier_is_eu': false }));
  it('a booking mixing known and unknown airlines leaves the booking airline unset', () => {
    const a = leg('UA', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z');
    const b = leg('ZZ', 'EWR', 'LIS', '2026-11-03T23:15:00Z', '2026-11-04T06:35:00Z');
    expect(sit(a, [a, b])).not.toHaveProperty('trip.booked_with_us_carrier');
  });
});

describe('6: notice days come from a watched change', () => {
  const far = leg('TP', 'EWR', 'LIS', '2026-11-20T23:15:00Z', '2026-11-21T06:35:00Z');
  it('P11: is unset with no snapshot of the original schedule', () => {
    expect(sit(far, [far], { type: 'cancellation', detectedAt: '2026-11-08T00:00:00Z' })).not.toHaveProperty('event.notice_days');
    // The cancelled snapshot itself is not a sighting of the original schedule.
    expect(sit(far, [far], { type: 'cancellation', detectedAt: '2026-11-08T00:00:00Z', observed: [obs({ cancelled: true, scheduledOut: far.scheduledOut })] })).not.toHaveProperty('event.notice_days');
  });
  const watched = (seenAt: string, detectedAt: string) =>
    sit(far, [far], { type: 'cancellation', detectedAt, observed: [obs({ observedAt: seenAt, scheduledOut: far.scheduledOut }), obs({ cancelled: true, scheduledOut: far.scheduledOut, observedAt: detectedAt })] });
  it('is set when both bounds give the same whole days', () => expect(watched('2026-11-08T00:00:00Z', '2026-11-08T02:00:00Z')['event.notice_days']).toBe(12));
  it('is unset when a day boundary falls between the two bounds', () => expect(watched('2026-11-06T22:00:00Z', '2026-11-07T02:00:00Z')).not.toHaveProperty('event.notice_days'));
});

describe('7: planner answers are scoped', () => {
  it('P10: an answer never overrides a derived fact or injects another fact', () => {
    const known = [leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z')];
    const s = sit(tpOut, [tpOut], { type: 'cancellation', offers: [known], answers: { 'event.reroute_arrival_delay_minutes': 1, 'flight.distance_km': 9999, 'passenger.volunteered': true } });
    expect(s['event.reroute_arrival_delay_minutes']).toBe(1440);
    expect(s).not.toHaveProperty('flight.distance_km');
    expect(s['passenger.volunteered']).toBe(true);
  });
  it('P8b: every accepted answer is a value matchRules accepts', () => {
    const rules = (fixture as unknown as { rules: never[] }).rules;
    for (const [fact, value] of [['event.reroute_arrival_delay_minutes', '120'], ['passenger.volunteered', 'true'], ['event.cause', 'controllable']] as const) {
      expect(() => matchRules(rules, { 'event.type': 'cancellation', [fact]: answerValue({ fact, value }) } as never)).not.toThrow();
    }
  });
});

describe('9, 11, 12', () => {
  it('9: single_ticket is unset for two nonstops on one booking', () => {
    const back = leg('TP', 'LIS', 'EWR', '2026-11-10T12:00:00Z', '2026-11-10T20:20:00Z');
    expect(sit(tpOut, [tpOut, back])).not.toHaveProperty('flight.single_ticket');
  });
  it('11: Åland is in the EU', () => {
    const f = leg('AY', 'AAA', 'EWR', '2026-11-03T08:00:00Z', '2026-11-03T16:00:00Z');
    expect(sit({ ...f, originCountry: 'AX' }, [f])).toMatchObject({ 'flight.departs_eu': true });
  });
  it('12: a disrupted flight missing from the booking leaves every booking-level and journey fact unset', () => {
    const other = leg('UA', 'ORD', 'JFK', '2026-11-03T08:00:00Z', '2026-11-03T10:00:00Z');
    const s = sit(tpOut, [other], { airports: { EWR: { latitude: 0, longitude: 0 }, LIS: { latitude: 0, longitude: 20 } } });
    for (const fact of ['trip.touches_us', 'trip.itinerary_domestic_us', 'trip.booked_with_us_carrier', 'trip.journey_arrives_eu', 'flight.distance_km', 'flight.single_ticket', 'trip.us_foreign_nonstop_minutes']) {
      expect(s, fact).not.toHaveProperty(fact);
    }
  });
  it('12: two identical-looking flights with unknown times are ambiguous, so the booking facts stay unset', () => {
    const a = leg('UA', 'EWR', 'ORD', null, null);
    const b = leg('UA', 'ORD', 'EWR', '2026-11-05T10:00:00Z', '2026-11-05T13:00:00Z');
    expect(sit(a, [a, b, { ...a }])).not.toHaveProperty('trip.touches_us');
  });
});
