import { describe, expect, it } from 'vitest';
import { buildSituation, type ItinerarySegment, type SituationInput } from '@/lib/assist/situation';

const leg = (carrierIata: string, o: string, d: string, out: string, inn: string): ItinerarySegment => ({
  carrierIata, operatorIata: carrierIata, originIata: o, destinationIata: d, originCountry: o === 'LIS' ? 'PT' : 'US', destinationCountry: d === 'LIS' ? 'PT' : 'US', scheduledOut: out, scheduledIn: inn,
});
const cancel = (flight: ItinerarySegment, segments: ItinerarySegment[], offers: ItinerarySegment[][]) =>
  buildSituation({
    event: { type: 'cancellation', delayMinutes: null, detectedAt: '2026-11-01T12:00:00Z', observed: [], offers } as SituationInput['event'],
    segment: { ...flight, distanceKm: null },
    booking: { bookedVia: null, bookedAt: null, segments },
    airports: {},
    answers: {},
  });

const feeder = leg('UA', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z');
const onward = leg('TP', 'EWR', 'LIS', '2026-11-03T22:00:00Z', '2026-11-04T05:20:00Z');

describe('1: a listed cancelled flight is not a feeder', () => {
  it('R1j2: [cancelled flight, replacement next day] gives an arrival of 1440, not 0', () => {
    const f = leg('TP', 'EWR', 'LIS', '2026-11-03T23:15:00Z', '2026-11-04T06:35:00Z');
    const next = leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z');
    expect(cancel(f, [f], [[f, next]])).toMatchObject({ 'event.reroute_departs_early_minutes': 0, 'event.reroute_arrival_delay_minutes': 1440 });
  });
});

describe('2: an offer that leaves out the booked feeder', () => {
  const omit = (out: string, inn: string) => cancel(onward, [feeder, onward], [[leg('TP', 'EWR', 'LIS', out, inn)]]);
  it('R1l: leaving 30 minutes before the feeder lands leaves both facts unset', () => {
    const s = omit('2026-11-03T20:00:00Z', '2026-11-04T03:30:00Z');
    expect(s).not.toHaveProperty('event.reroute_departs_early_minutes');
    expect(s).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('R1k: a 10-minute gap leaves the arrival unset', () => {
    const s = omit('2026-11-03T20:40:00Z', '2026-11-04T04:00:00Z');
    expect(s['event.reroute_departs_early_minutes']).toBe(80);
    expect(s).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('a 30-minute gap holds', () => {
    expect(omit('2026-11-03T21:00:00Z', '2026-11-04T05:20:00Z')['event.reroute_arrival_delay_minutes']).toBe(0);
  });
});

describe('3: a hidden arrival among the offers in the running', () => {
  const onward2 = leg('TP', 'EWR', 'LIS', '2026-11-03T21:40:00Z', '2026-11-04T05:00:00Z');
  const A = [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T21:10:00Z', '2026-11-04T06:00:00Z')]; // 30 min early, known arrival
  it('R1f: leaves the early-departure fact unset when a 50-minutes-early offer has a 20-minute connection', () => {
    const B = [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T20:50:00Z', '2026-11-04T04:00:00Z')];
    const s = cancel(onward2, [feeder, onward2], [A, B]);
    expect(s).not.toHaveProperty('event.reroute_departs_early_minutes');
    expect(s).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });
  it('still reports when the offers agree on the departure', () => {
    const B = [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T21:10:00Z', '2026-11-04T04:00:00Z')];
    const same = [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T21:10:00Z', '2026-11-04T06:00:00Z')];
    expect(cancel(onward2, [feeder, onward2], [same, B])['event.reroute_departs_early_minutes']).toBe(30);
  });
});
