import { validateSituation } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import { buildSituation, type ItinerarySegment, type ObservedFlight, type SituationInput } from '@/lib/assist/situation';

const leg = (carrierIata: string, o: string, d: string, out: string | null, inn: string | null, operatorIata: string | null = carrierIata): ItinerarySegment => ({
  carrierIata, operatorIata, originIata: o, destinationIata: d, originCountry: o === 'LIS' ? 'PT' : 'US', destinationCountry: d === 'LIS' ? 'PT' : 'US', scheduledOut: out, scheduledIn: inn,
});
type Extra = Partial<{ type: SituationInput['event']['type']; observed: ObservedFlight[]; offers: ItinerarySegment[][]; answers: SituationInput['answers']; detectedAt: string }>;
const sit = (flight: ItinerarySegment, segments: ItinerarySegment[], extra: Extra = {}) =>
  buildSituation({
    event: { type: extra.type ?? 'delay', delayMinutes: null, detectedAt: extra.detectedAt ?? '2026-11-08T12:00:00Z', observed: extra.observed ?? [], offers: extra.offers ?? [] },
    segment: { ...flight, distanceKm: null },
    booking: { bookedVia: null, bookedAt: null, segments },
    airports: {},
    answers: extra.answers ?? {},
  });
const obs = (change: Partial<ObservedFlight> = {}): ObservedFlight => ({ observedAt: '2026-11-08T09:00:00Z', cancelled: false, diverted: false, scheduledOut: null, estimatedOut: null, actualOut: null, scheduledIn: null, ...change });

const feeder = leg('UA', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z');
const tpOut = leg('TP', 'EWR', 'LIS', '2026-11-03T23:15:00Z', '2026-11-04T06:35:00Z');

describe('1: the connection into the first new flight is checked', () => {
  const rebook = (out: string, inn: string) => sit(tpOut, [feeder, tpOut], { type: 'cancellation', offers: [[feeder, leg('TP', 'EWR', 'LIS', out, inn)]] });
  it('an onward leg leaving 20 minutes after the feeder lands leaves the arrival unset', () => {
    const s = rebook('2026-11-03T20:50:00Z', '2026-11-04T04:00:00Z');
    expect(s['event.reroute_departs_early_minutes']).toBe(145);
    expect(s).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('an onward leg leaving before the feeder lands leaves both unset', () => {
    const s = rebook('2026-11-03T20:00:00Z', '2026-11-04T03:30:00Z');
    expect(s).not.toHaveProperty('event.reroute_departs_early_minutes');
    expect(s).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('a forwarded feeder followed by a new onward flight 10 minutes later leaves the arrival unset', () => {
    expect(rebook('2026-11-03T20:40:00Z', '2026-11-04T04:00:00Z')).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('a 30-minute connection holds', () => {
    expect(rebook('2026-11-03T21:00:00Z', '2026-11-04T06:35:00Z')['event.reroute_arrival_delay_minutes']).toBe(0);
  });
});

describe('2: notice days need a sighting of the original schedule before detection', () => {
  const far = leg('TP', 'EWR', 'LIS', '2026-11-20T23:15:00Z', '2026-11-21T06:35:00Z');
  const original = (change: Partial<ObservedFlight> = {}) => obs({ scheduledOut: far.scheduledOut, ...change });
  const notice = (type: SituationInput['event']['type'], observed: ObservedFlight[]) => sit(far, [far], { type, observed, detectedAt: '2026-11-08T12:00:00Z' });
  it('a strictly earlier sighting sets it', () => {
    expect(notice('cancellation', [original({ observedAt: '2026-11-08T09:00:00Z' }), original({ cancelled: true, observedAt: '2026-11-08T12:00:00Z' })])['event.notice_days']).toBe(12);
  });
  it('a reinstated cancellation leaves it unset', () => {
    const observed = [original({ cancelled: true, observedAt: '2026-11-08T10:00:00Z' }), original({ observedAt: '2026-11-08T11:00:00Z' })];
    expect(notice('cancellation', observed)).not.toHaveProperty('event.notice_days');
  });
  it('a reverted schedule change leaves it unset', () => {
    const observed = [obs({ scheduledOut: '2026-11-20T21:00:00Z', observedAt: '2026-11-08T10:00:00Z' }), original({ observedAt: '2026-11-08T11:00:00Z' })];
    expect(notice('schedule_change', observed)).not.toHaveProperty('event.notice_days');
  });
  it('a delay incident’s raising snapshot is not a sighting before detection', () => {
    expect(notice('delay', [original({ observedAt: '2026-11-08T12:00:00Z' })])).not.toHaveProperty('event.notice_days');
  });
});

describe('4: trip.booked_with_us_carrier is the marketing carrier', () => {
  const booked = (marketing: string, operator: string) => {
    const f = leg(marketing, 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z', operator);
    return sit(f, [f]);
  };
  it('booked on DL, operated by AF: true, while the flight facts follow the operator', () =>
    expect(booked('DL', 'AF')).toMatchObject({ 'trip.booked_with_us_carrier': true, 'flight.carrier_is_us': false, 'flight.carrier_is_eu': true }));
  it('booked on KL, operated by DL: false', () => expect(booked('KL', 'DL')).toMatchObject({ 'trip.booked_with_us_carrier': false, 'flight.carrier_is_us': true }));
  it('an unknown marketing code leaves it unset', () => expect(booked('ZZ', 'DL')).not.toHaveProperty('trip.booked_with_us_carrier'));
});

describe('5: a re-time on any snapshot leaves the departure delay unset', () => {
  it('a +120 re-time that was later reverted', () => {
    const observed = [obs({ scheduledOut: '2026-11-04T01:15:00Z', estimatedOut: '2026-11-04T01:15:00Z' }), obs({ scheduledOut: tpOut.scheduledOut, estimatedOut: '2026-11-04T01:15:00Z' })];
    expect(sit(tpOut, [tpOut], { observed })).not.toHaveProperty('event.departure_delay_minutes');
  });
});

describe('6: SAS (SK) is unset', () => {
  it('leaves the carrier facts unset', () => {
    const f = leg('SK', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z');
    expect(sit(f, [f])).not.toHaveProperty('flight.carrier_is_eu');
    expect(sit(f, [f])).not.toHaveProperty('flight.carrier_is_us');
    expect(sit(f, [f])).not.toHaveProperty('trip.booked_with_us_carrier');
  });
});

describe('7: stored answers are validated like new ones', () => {
  it('ignores a string for a boolean fact, an unknown fact, "mixed", and an off-list number, and the situation still validates', () => {
    const s = sit(tpOut, [tpOut], {
      answers: { 'passenger.volunteered': 'true', 'bogus.fact': 1, 'passenger.accepted_alternative': 'mixed', 'event.reroute_arrival_delay_minutes': 121, 'event.cause': 'weather' } as never,
    });
    for (const fact of ['passenger.volunteered', 'bogus.fact', 'passenger.accepted_alternative', 'event.reroute_arrival_delay_minutes', 'event.cause']) expect(s, fact).not.toHaveProperty(fact);
    expect(() => validateSituation(s)).not.toThrow();
  });
  it('keeps valid stored answers', () => {
    const s = sit(tpOut, [tpOut], { answers: { 'passenger.volunteered': true, 'event.reroute_arrival_delay_minutes': 120, 'event.cause': 'controllable' } });
    expect(s).toMatchObject({ 'passenger.volunteered': true, 'event.reroute_arrival_delay_minutes': 120, 'event.cause': 'controllable' });
  });
});
