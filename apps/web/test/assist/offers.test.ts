import { describe, expect, it } from 'vitest';
import { DAY, HOUR, journeyOf, MIN_CONNECTION_MINUTES, MINUTE, positionOf, sameFlight, time } from '@/lib/assist/journey';
import { buildSituation, type ItinerarySegment, type ObservedFlight, type SituationInput } from '@/lib/assist/situation';

const EARLY = 'event.reroute_departs_early_minutes';
const ARRIVAL = 'event.reroute_arrival_delay_minutes';
const UNSET = 'unset';

const COUNTRY: Record<string, string> = { SFO: 'US', JFK: 'US', EWR: 'US', ORD: 'US', LIS: 'PT', OPO: 'PT', MAD: 'ES', BCN: 'ES' };
const B0 = Date.parse('2026-11-03T12:00:00Z');
/** A time as minutes after 2026-11-03 12:00 UTC, or as an ISO string. */
const at = (t: number | string | null): string | null => (typeof t === 'number' ? new Date(B0 + t * MINUTE).toISOString() : t);
const leg = (carrier: string, o: string, d: string, out: number | string | null, inn: number | string | null): ItinerarySegment => ({
  carrierIata: carrier,
  operatorIata: carrier,
  originIata: o,
  destinationIata: d,
  originCountry: COUNTRY[o] ?? null,
  destinationCountry: COUNTRY[d] ?? null,
  scheduledOut: at(out),
  scheduledIn: at(inn),
});
const snapshot = (change: Partial<ObservedFlight>): ObservedFlight => ({
  observedAt: '2026-11-01T10:00:00Z',
  cancelled: false,
  diverted: false,
  scheduledOut: null,
  estimatedOut: null,
  actualOut: null,
  scheduledIn: null,
  ...change,
});

interface Event {
  type?: 'cancellation' | 'schedule_change';
  offers?: ItinerarySegment[][];
  observed?: ObservedFlight[];
  detectedAt?: string;
}
const input = (flight: ItinerarySegment, segments: ItinerarySegment[], e: Event = {}): SituationInput => ({
  event: { type: e.type ?? 'cancellation', delayMinutes: null, detectedAt: e.detectedAt ?? '2026-11-01T12:00:00Z', observed: e.observed ?? [], offers: e.offers ?? [] },
  segment: { ...flight, distanceKm: null },
  booking: { bookedVia: null, bookedAt: null, segments },
  airports: {},
  answers: {},
});
const facts = (i: SituationInput) => {
  const s = buildSituation(i);
  return { early: s[EARLY] ?? UNSET, arrival: s[ARRIVAL] ?? UNSET };
};
/** The re-routing facts for a cancelled flight and the rebookings forwarded for it. */
const cancelled = (flight: ItinerarySegment, segments: ItinerarySegment[], ...offers: ItinerarySegment[][]) => facts(input(flight, segments, { offers }));
/** The re-routing facts for a flight AeroAPI shows moved to new times. */
const changed = (flight: ItinerarySegment, segments: ItinerarySegment[], out: number | string, inn: number | string) => {
  const moved = snapshot({ scheduledOut: at(out), estimatedOut: at(out), scheduledIn: at(inn) });
  return facts(input(flight, segments, { type: 'schedule_change', observed: [moved] }));
};

// The reviewers' probes, with ISO times as they wrote them.
const tp = leg('TP', 'EWR', 'LIS', '2026-11-03T23:15:00Z', '2026-11-04T06:35:00Z');
const feeder = leg('UA', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z');
const onward = leg('TP', 'EWR', 'LIS', '2026-11-03T22:00:00Z', '2026-11-04T05:20:00Z');

describe('P: offers against a one- or two-flight journey', () => {
  it('P4: an offer with an unknown departure, beside a known one, leaves both facts unset', () => {
    const known = [leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z')];
    const unknownOut = [leg('TP', 'EWR', 'LIS', null, '2026-11-04T07:35:00Z')];
    expect(cancelled(tp, [tp], known, unknownOut)).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('P5: flights that do not connect (MAD, then BCN) leave the arrival unset; the departure still counts', () => {
    const offer = [leg('IB', 'EWR', 'MAD', '2026-11-03T23:00:00Z', '2026-11-04T06:00:00Z'), leg('VY', 'BCN', 'LIS', '2026-11-04T06:00:00Z', '2026-11-04T07:30:00Z')];
    expect(cancelled(tp, [tp], offer)).toEqual({ early: 15, arrival: UNSET });
  });
  it('P6: a re-timed feeder is not the departure; the new flight from the origin airport is', () => {
    const offer = [leg('UA', 'ORD', 'EWR', '2026-11-03T17:30:00Z', '2026-11-03T20:00:00Z'), leg('TP', 'EWR', 'LIS', '2026-11-04T00:15:00Z', '2026-11-04T07:35:00Z')];
    expect(cancelled(tp, [feeder, tp], offer)).toEqual({ early: 0, arrival: 60 });
  });
  it('P6b: a changed feeder needs 30 minutes to the booked connection', () => {
    expect(changed(feeder, [feeder, tp], '2026-11-03T20:45:00Z', '2026-11-03T23:15:00Z')).toEqual({ early: 0, arrival: UNSET });
    expect(changed(feeder, [feeder, tp], '2026-11-03T20:45:00Z', '2026-11-03T22:46:00Z')).toEqual({ early: 0, arrival: UNSET });
    expect(changed(feeder, [feeder, tp], '2026-11-03T20:45:00Z', '2026-11-03T22:45:00Z')).toEqual({ early: 0, arrival: 0 });
  });
});

describe('R1: the connection into the first new flight', () => {
  it('R1a: the onward flight moved earlier, onto a 20-minute connection', () => {
    expect(changed(onward, [feeder, onward], '2026-11-03T20:50:00Z', '2026-11-04T04:10:00Z')).toEqual({ early: 70, arrival: UNSET });
  });
  it('R1b: the onward flight moved to leave before the feeder lands', () => {
    expect(changed(onward, [feeder, onward], '2026-11-03T20:00:00Z', '2026-11-04T03:20:00Z')).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('R1c: the feeder repeated, then a new onward flight 10 minutes after it lands', () => {
    expect(cancelled(onward, [feeder, onward], [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T20:40:00Z', '2026-11-04T04:00:00Z')])).toEqual({ early: 80, arrival: UNSET });
  });
  it('R1d: a changed feeder that lands after the booked onward flight leaves is contradictory', () => {
    expect(changed(feeder, [feeder, onward], '2026-11-03T19:40:00Z', '2026-11-03T22:10:00Z')).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('R1e: a new feeder that lands after the booked onward flight leaves is contradictory', () => {
    expect(cancelled(feeder, [feeder, onward], [leg('AA', 'ORD', 'EWR', '2026-11-03T17:20:00Z', '2026-11-03T22:05:00Z'), onward])).toEqual({ early: UNSET, arrival: UNSET });
  });
  describe('R1f: several offers', () => {
    const onward2 = leg('TP', 'EWR', 'LIS', '2026-11-03T21:40:00Z', '2026-11-04T05:00:00Z');
    const A = [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T21:10:00Z', '2026-11-04T06:00:00Z')]; // 30 early, arrives +60
    it('a 30-minutes-early offer, and a 50-minutes-early one on a 20-minute connection: both unset', () => {
      const B = [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T20:50:00Z', '2026-11-04T04:00:00Z')];
      expect(cancelled(onward2, [feeder, onward2], A, B)).toEqual({ early: UNSET, arrival: UNSET });
    });
    it('the same with the second on a 30-minute connection: the sooner arrival', () => {
      const B2 = [feeder, leg('TP', 'EWR', 'LIS', '2026-11-03T21:00:00Z', '2026-11-04T04:00:00Z')];
      expect(cancelled(onward2, [feeder, onward2], A, B2)).toEqual({ early: 40, arrival: 0 });
    });
    it('two re-timed feeders, one that misses the onward flight: both unset', () => {
      const late = [leg('AA', 'ORD', 'EWR', '2026-11-03T17:20:00Z', '2026-11-03T21:45:00Z'), onward];
      const ok = [leg('AA', 'ORD', 'EWR', '2026-11-03T17:45:00Z', '2026-11-03T20:15:00Z'), onward];
      expect(cancelled(feeder, [feeder, onward], late, ok)).toEqual({ early: UNSET, arrival: UNSET });
    });
  });
  describe('rebookings that repeat another journey on the booking', () => {
    const out = leg('TP', 'JFK', 'LIS', '2026-11-03T23:00:00Z', '2026-11-04T06:00:00Z');
    it('R1g: an open-jaw return rebooked, with the outbound repeated', () => {
      const back = leg('IB', 'MAD', 'JFK', '2026-11-10T10:00:00Z', '2026-11-10T18:00:00Z');
      expect(cancelled(back, [out, back], [out, leg('IB', 'MAD', 'JFK', '2026-11-10T12:00:00Z', '2026-11-10T20:00:00Z')])).toEqual({ early: 0, arrival: 120 });
    });
    const back2 = leg('TP', 'LIS', 'JFK', '2026-11-10T10:00:00Z', '2026-11-10T18:00:00Z');
    const rebooked = leg('TP', 'LIS', 'JFK', '2026-11-10T12:00:00Z', '2026-11-10T20:00:00Z');
    it('R1h: a round-trip return rebooked, with the outbound repeated', () => {
      expect(cancelled(back2, [out, back2], [out, rebooked])).toEqual({ early: 0, arrival: 120 });
    });
    it('R1i: while the booking’s connection times are unknown, so is the journey, and both facts', () => {
      const outNoIn = { ...out, scheduledIn: null };
      expect(cancelled(back2, [outNoIn, back2], [outNoIn, rebooked])).toEqual({ early: UNSET, arrival: UNSET });
    });
  });
  describe('a re-issued ticket that lists the return too (Task 12 loads rebookings as whole bookings)', () => {
    // ORD → EWR → LIS, and back a week later through EWR.
    const out1 = leg('UA', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z');
    const back1 = leg('TP', 'LIS', 'EWR', '2026-11-10T12:00:00Z', '2026-11-10T20:20:00Z');
    const back2 = leg('UA', 'EWR', 'ORD', '2026-11-10T23:00:00Z', '2026-11-11T01:45:00Z');
    const booking = [out1, tp, back1, back2];
    const next = leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z');
    it('the return is a booked flight, never the re-routing’s departure from the origin airport', () => {
      const viaJfk = [leg('UA', 'ORD', 'JFK', '2026-11-03T19:00:00Z', '2026-11-03T21:30:00Z'), leg('TP', 'JFK', 'LIS', '2026-11-03T23:00:00Z', '2026-11-04T06:00:00Z')];
      // Nothing new leaves EWR, so the departure is unknown; the return flight from EWR does not count.
      expect(cancelled(tp, booking, [...viaJfk, back1, back2])).toEqual({ early: UNSET, arrival: 0 });
    });
    it('the re-routing ends at the final destination when only the booked return follows', () => {
      expect(cancelled(tp, booking, [out1, next, back1, back2])).toEqual({ early: 0, arrival: 1440 });
      expect(cancelled(tp, booking, [out1, next])).toEqual({ early: 0, arrival: 1440 });
    });
    it('a new flight after the final destination still leaves the arrival unset', () => {
      const onToOpo = leg('TP', 'LIS', 'OPO', '2026-11-05T09:00:00Z', '2026-11-05T10:00:00Z');
      const afterReturn = leg('UA', 'ORD', 'SFO', '2026-11-11T10:00:00Z', '2026-11-11T14:30:00Z');
      expect(cancelled(tp, booking, [out1, next, onToOpo])).toEqual({ early: 0, arrival: UNSET });
      expect(cancelled(tp, booking, [out1, next, back1, back2, afterReturn])).toEqual({ early: 0, arrival: UNSET });
    });
  });
  it('a booked flight of this journey after the final destination is not cut off', () => {
    // A → B → f, B cancelled; the offer flies ORD→LIS direct, then lists f, which is on this journey.
    const A = leg('UA', 'SFO', 'ORD', 0, 240);
    const B = leg('UA', 'ORD', 'EWR', 300, 450);
    const f = leg('TP', 'EWR', 'LIS', 540, 960);
    const direct = leg('AA', 'ORD', 'LIS', 300, 500);
    expect(cancelled(B, [A, B, f], [direct, f])).toEqual({ early: 0, arrival: UNSET });
    expect(cancelled(B, [A, B, f], [direct])).toEqual({ early: 0, arrival: 0 });
  });
  it('an offer that reaches the final destination, flies on, and comes back has no one arrival', () => {
    const next = leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z');
    const away = leg('TP', 'LIS', 'OPO', '2026-11-05T09:00:00Z', '2026-11-05T10:00:00Z');
    const back = leg('TP', 'OPO', 'LIS', '2026-11-05T12:00:00Z', '2026-11-05T13:00:00Z');
    expect(cancelled(tp, [tp], [next, away, back])).toEqual({ early: 0, arrival: UNSET });
  });
  it('R1j: [the cancelled flight, a new flight onward from its destination] re-routes nothing', () => {
    expect(cancelled(tp, [tp], [tp, leg('TP', 'LIS', 'OPO', '2026-11-04T09:00:00Z', '2026-11-04T10:00:00Z')])).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('R1j2: [the cancelled flight, its replacement the next day] arrives 1440 minutes late', () => {
    const next = leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z');
    expect(cancelled(tp, [tp], [tp, next])).toEqual({ early: 0, arrival: 1440 });
    expect(cancelled(tp, [tp], [next])).toEqual({ early: 0, arrival: 1440 });
  });
  it('R1k: an offer leaving out the booked feeder, 10 minutes after it lands', () => {
    expect(cancelled(onward, [feeder, onward], [leg('TP', 'EWR', 'LIS', '2026-11-03T20:40:00Z', '2026-11-04T04:00:00Z')])).toEqual({ early: 80, arrival: UNSET });
  });
  it('R1l: an offer leaving out the booked feeder, leaving 30 minutes before it lands', () => {
    expect(cancelled(onward, [feeder, onward], [leg('TP', 'EWR', 'LIS', '2026-11-03T20:00:00Z', '2026-11-04T03:30:00Z')])).toEqual({ early: UNSET, arrival: UNSET });
  });
});

describe('probe8: a listed copy of the cancelled flight is never the departure', () => {
  const early = leg('TP', 'EWR', 'LIS', '2026-11-03T21:15:00Z', '2026-11-04T04:35:00Z');
  const B = leg('UA', 'ORD', 'EWR', '2026-11-03T17:00:00Z', '2026-11-03T19:30:00Z');
  it('on a one-flight journey', () => {
    expect(cancelled(tp, [tp], [tp, early])).toEqual({ early: 120, arrival: 0 });
    expect(cancelled(tp, [tp], [early])).toEqual({ early: 120, arrival: 0 });
  });
  it('after a feeder', () => {
    expect(cancelled(tp, [B, tp], [tp, early])).toEqual({ early: 120, arrival: 0 });
    expect(cancelled(tp, [B, tp], [early])).toEqual({ early: 120, arrival: 0 });
  });
});

// probe7's cases, in minutes after 2026-11-03 12:00 UTC.
describe('2a: the disrupted flight is the first on its journey', () => {
  const f = leg('UA', 'ORD', 'EWR', 0, 150);
  const c = leg('TP', 'EWR', 'LIS', 240, 680);
  it('2a1: a new feeder an hour later, on a 30-minute connection', () => expect(cancelled(f, [f, c], [leg('UA', 'ORD', 'EWR', 60, 210), c])).toEqual({ early: 0, arrival: 0 }));
  it('2a2: a new feeder that lands after the booked onward flight leaves', () => expect(cancelled(f, [f, c], [leg('UA', 'ORD', 'EWR', 60, 250), c])).toEqual({ early: UNSET, arrival: UNSET }));
  it('2a3: [copy of f, new feeder, new onward flight]', () => {
    expect(cancelled(f, [f, c], [f, leg('UA', 'ORD', 'EWR', 120, 270), leg('TP', 'EWR', 'LIS', 330, 770)])).toEqual({ early: 0, arrival: 90 });
  });
  it('2a4: a one-flight journey, a new flight', () => expect(cancelled(f, [f], [leg('UA', 'ORD', 'EWR', 60, 210)])).toEqual({ early: 0, arrival: 60 }));
  it('2a5: a one-flight journey, [copy of f, new flight]', () => expect(cancelled(f, [f], [f, leg('UA', 'ORD', 'EWR', 60, 210)])).toEqual({ early: 0, arrival: 60 }));
});

describe('2b: a three-flight journey A → B → f, f cancelled', () => {
  const A = leg('UA', 'SFO', 'ORD', 0, 240);
  const B = leg('UA', 'ORD', 'EWR', 300, 450);
  const f = leg('TP', 'EWR', 'LIS', 540, 960);
  const J = [A, B, f];
  it('2b1: a new flight 10 minutes after B lands', () => expect(cancelled(f, J, [leg('TP', 'EWR', 'LIS', 460, 880)])).toEqual({ early: 80, arrival: UNSET }));
  it('2b2: a new flight before B lands', () => expect(cancelled(f, J, [leg('TP', 'EWR', 'LIS', 420, 840)])).toEqual({ early: UNSET, arrival: UNSET }));
  it('2b3: [A, B, a new flight before B lands]', () => expect(cancelled(f, J, [A, B, leg('TP', 'EWR', 'LIS', 420, 840)])).toEqual({ early: UNSET, arrival: UNSET }));
  it('2b4: [A, B, a new flight an hour after B lands]', () => expect(cancelled(f, J, [A, B, leg('TP', 'EWR', 'LIS', 510, 930)])).toEqual({ early: 30, arrival: 0 }));
  it('2b5: [A, a new ORD→EWR leaving before A lands, a new EWR→LIS]', () => {
    expect(cancelled(f, J, [A, leg('AA', 'ORD', 'EWR', 200, 350), leg('TP', 'EWR', 'LIS', 420, 840)])).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('2b6: [A, a new ORD→EWR 10 minutes after A lands, a new EWR→LIS]', () => {
    expect(cancelled(f, J, [A, leg('AA', 'ORD', 'EWR', 250, 400), leg('TP', 'EWR', 'LIS', 460, 880)])).toEqual({ early: 80, arrival: UNSET });
  });
  it('2b7: [A, a new ORD→EWR an hour after A lands, a new EWR→LIS]', () => {
    expect(cancelled(f, J, [A, leg('AA', 'ORD', 'EWR', 300, 450), leg('TP', 'EWR', 'LIS', 510, 930)])).toEqual({ early: 30, arrival: 0 });
  });
  it('2b8: A left out; the new ORD→EWR leaves before A lands', () => {
    expect(cancelled(f, J, [leg('AA', 'ORD', 'EWR', 200, 350), leg('TP', 'EWR', 'LIS', 420, 840)])).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('2b9: A left out; the new ORD→EWR leaves 10 minutes after A lands', () => {
    expect(cancelled(f, J, [leg('AA', 'ORD', 'EWR', 250, 400), leg('TP', 'EWR', 'LIS', 460, 880)])).toEqual({ early: 80, arrival: UNSET });
  });
});

describe('2d: lookalikes of booked flights', () => {
  const B = leg('UA', 'ORD', 'EWR', 300, 450);
  const f = leg('TP', 'EWR', 'LIS', 540, 960);
  it('2d3: B an hour later (a new flight), then a new EWR→LIS 10 minutes after', () => {
    expect(cancelled(f, [B, f], [leg('UA', 'ORD', 'EWR', 360, 510), leg('TP', 'EWR', 'LIS', 520, 940)])).toEqual({ early: 20, arrival: UNSET });
  });
  it('2d4: B’s times under another code (a new flight), then a new EWR→LIS 10 minutes after', () => {
    expect(cancelled(f, [B, f], [leg('LH', 'ORD', 'EWR', 300, 450), leg('TP', 'EWR', 'LIS', 460, 880)])).toEqual({ early: 80, arrival: UNSET });
  });
  it('2d5: f’s times under another code, then on past the final destination', () => {
    expect(cancelled(f, [B, f], [leg('UA', 'EWR', 'LIS', 540, 960), leg('TP', 'LIS', 'OPO', 1100, 1160)])).toEqual({ early: 0, arrival: UNSET });
  });
});

describe('3: offers that leave at the same time', () => {
  const B = leg('UA', 'ORD', 'EWR', 300, 450);
  const f = leg('TP', 'EWR', 'LIS', 540, 960);
  it('3a: one hides its arrival: the shared departure is set, the arrival is not', () => {
    expect(cancelled(f, [B, f], [leg('TP', 'EWR', 'LIS', 470, 900)], [B, leg('UA', 'EWR', 'LIS', 470, 880)])).toEqual({ early: 70, arrival: UNSET });
  });
  it('3b: both hide their arrival', () => {
    expect(cancelled(f, [B, f], [leg('TP', 'EWR', 'LIS', 465, 900)], [leg('UA', 'EWR', 'LIS', 465, 880)])).toEqual({ early: 75, arrival: UNSET });
  });
  it('arrivals that tie report the smaller early departure, whatever the order', () => {
    const x = [leg('TP', 'EWR', 'LIS', 500, 900)]; // 40 early
    const y = [leg('UA', 'EWR', 'LIS', 490, 900)]; // 50 early, same arrival
    expect(cancelled(f, [B, f], x, y)).toEqual({ early: 40, arrival: 0 });
    expect(cancelled(f, [B, f], y, x)).toEqual({ early: 40, arrival: 0 });
  });
});

describe('round 5: booked journey flights listed before the first new flight', () => {
  it('#91: [MAD→SFO, SFO→JFK] listed, then a new MAD→OPO that leaves before they land', () => {
    const A = leg('TP', 'MAD', 'SFO', 192, 285);
    const B = leg('UA', 'SFO', 'JFK', 471, 647);
    const f = leg('AA', 'JFK', 'OPO', 807, 1112);
    expect(cancelled(f, [A, B, f], [A, B, leg('UA', 'MAD', 'OPO', 594, 957)])).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('#12: [LIS→OPO] listed, then a new LIS→ORD', () => {
    const A = leg('AA', 'LIS', 'OPO', 131, 296);
    const f = leg('UA', 'OPO', 'ORD', 436, 822);
    expect(cancelled(f, [A, f], [A, leg('UA', 'LIS', 'ORD', 216, 400)])).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('#31: [MAD→OPO, OPO→ORD] listed, then a new MAD→SFO', () => {
    const A = leg('TP', 'MAD', 'OPO', 40, 387);
    const B = leg('IB', 'OPO', 'ORD', 546, 696);
    const f = leg('TP', 'ORD', 'SFO', 848, 1212);
    expect(cancelled(f, [A, B, f], [A, B, leg('UA', 'MAD', 'SFO', 191, 397)])).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('listing the booked flights up to where the offer takes over is unchanged', () => {
    const A = leg('UA', 'SFO', 'ORD', 0, 240);
    const B = leg('UA', 'ORD', 'EWR', 300, 450);
    const f = leg('TP', 'EWR', 'LIS', 540, 960);
    // B cancelled: [A, a new ORD→EWR, f].
    expect(cancelled(B, [A, B, f], [A, leg('AA', 'ORD', 'EWR', 300, 450), f])).toEqual({ early: 0, arrival: 0 });
    // f cancelled: [B, a new EWR→LIS], B being the tail of [A, B].
    expect(cancelled(f, [A, B, f], [B, leg('TP', 'EWR', 'LIS', 510, 930)])).toEqual({ early: 30, arrival: 0 });
  });
  it('a schedule change: a rebooking listing the flight at its original time before the new one', () => {
    const next = leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z');
    const moved = snapshot({ scheduledOut: '2026-11-04T01:15:00Z', estimatedOut: '2026-11-04T01:15:00Z', scheduledIn: '2026-11-04T08:35:00Z' });
    const change = (offer: ItinerarySegment[]) => facts(input(tp, [tp], { type: 'schedule_change', observed: [moved], offers: [offer] }));
    expect(change([next])).toEqual({ early: 0, arrival: 120 });
    expect(change([tp, next])).toEqual({ early: UNSET, arrival: UNSET });
  });
});

describe('round 5: with the notice unknown, every departure limit must pick the same offer', () => {
  const ninetyEarly = [leg('TP', 'EWR', 'LIS', '2026-11-03T21:45:00Z', '2026-11-04T04:35:00Z')]; // arrives 2 h early
  const thirtyEarly = [leg('TP', 'EWR', 'LIS', '2026-11-03T22:45:00Z', '2026-11-04T08:35:00Z')]; // arrives 2 h late
  /** A sighting of the original schedule an hour before detection makes the notice known. */
  const told = (detectedAt: string, ...offers: ItinerarySegment[][]) => {
    const sighting = snapshot({ observedAt: new Date(Date.parse(detectedAt) - HOUR).toISOString(), scheduledOut: tp.scheduledOut });
    return facts(input(tp, [tp], { offers, observed: [sighting], detectedAt }));
  };
  it('the 1-hour and 2-hour readings pick different offers: both unset, in either order', () => {
    expect(cancelled(tp, [tp], ninetyEarly, thirtyEarly)).toEqual({ early: UNSET, arrival: UNSET });
    expect(cancelled(tp, [tp], thirtyEarly, ninetyEarly)).toEqual({ early: UNSET, arrival: UNSET });
  });
  it('every reading picks the same offer: unchanged', () => {
    const soonest = [leg('TP', 'EWR', 'LIS', '2026-11-03T22:45:00Z', '2026-11-04T05:35:00Z')]; // 30 early, an hour early in
    const later = [leg('TP', 'EWR', 'LIS', '2026-11-04T00:15:00Z', '2026-11-04T07:35:00Z')];
    expect(cancelled(tp, [tp], soonest, later)).toEqual({ early: 30, arrival: 0 });
  });
  it('with the notice known, its limit decides as before', () => {
    expect(told('2026-11-01T12:00:00Z', ninetyEarly, thirtyEarly)).toEqual({ early: 30, arrival: 120 }); // 2 days: 1 hour
    expect(told('2026-10-24T12:00:00Z', ninetyEarly, thirtyEarly)).toEqual({ early: 90, arrival: 0 }); // 10 days: 2 hours
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// HEAD 1c2c335's re-routing derivation, verbatim, for the monotonic-safety comparison.
interface HeadTimes {
  leaves: number;
  arrives: number | null;
}
function headOfferTimes(
  offer: ItinerarySegment[],
  booked: ItinerarySegment[],
  disrupted: ItinerarySegment,
  journey: ItinerarySegment[] | null,
  finalDestination: string | null,
): HeadTimes | 'unknown' {
  const origin = disrupted.originIata;
  const leaves = time(offer.find((f) => f.originIata === origin)?.scheduledOut ?? null);
  const start = offer.findIndex((f) => !booked.some((b) => sameFlight(b, f)));
  if (leaves === null || start < 0) return 'unknown';
  const at = journey?.findIndex((f) => sameFlight(f, disrupted)) ?? -1;
  const feeder = at > 0 ? journey![at - 1] : null;
  const first = offer[start];
  const prev = start > 0 ? offer[start - 1] : null;
  const feederInto = feeder && ((prev && sameFlight(prev, feeder)) || first.originIata === origin) ? feeder : null;
  if (feederInto) {
    const landed = time(feederInto.scheduledIn);
    const out = time(first.scheduledOut);
    if (landed === null || out === null) return 'unknown';
    if (out < landed) return 'unknown';
    if (first.originIata !== feederInto.destinationIata || out - landed < MIN_CONNECTION_MINUTES * MINUTE) return { leaves, arrives: null };
  }
  for (let i = start; i < offer.length; i += 1) {
    const landed = time(offer[i].scheduledIn);
    if (landed === null) return 'unknown';
    if (offer[i].destinationIata === finalDestination) return { leaves, arrives: landed };
    const next = offer[i + 1];
    if (!next) break;
    const nextOut = time(next.scheduledOut);
    if (nextOut === null) return 'unknown';
    if (nextOut < landed && !booked.some((b) => sameFlight(b, next))) return 'unknown';
    if (next.originIata !== offer[i].destinationIata || nextOut - landed < MIN_CONNECTION_MINUTES * MINUTE) break;
  }
  return { leaves, arrives: null };
}
function headChooseOffer(offers: HeadTimes[], bookedOut: number, noticeDays: number | null): HeadTimes | null {
  const limit = noticeDays === null || noticeDays < 7 ? HOUR : noticeDays < 14 ? 2 * HOUR : Infinity;
  const inLimit = offers.filter((o) => bookedOut - o.leaves <= limit);
  const running = inLimit.length > 0 ? inLimit : offers;
  const soonest = [...running].sort((a, b) => (a.arrives ?? Infinity) - (b.arrives ?? Infinity))[0];
  if (!soonest) return null;
  if (!running.some((o) => o.arrives === null)) return soonest;
  return running.every((o) => o.leaves === soonest.leaves) ? { leaves: soonest.leaves, arrives: null } : null;
}
/** HEAD's two facts, and whether its choice among offers rested on a tie that input order broke. */
function headReroute(i: SituationInput, noticeDays: number | null): { early?: number; arrival?: number; tie: boolean } {
  const out: { early?: number; arrival?: number; tie: boolean } = { tie: false };
  const { type, observed } = i.event;
  const bookedOut = time(i.segment.scheduledOut);
  const segments = i.booking.segments;
  const journey = positionOf(segments, i.segment) === null ? null : journeyOf(segments, i.segment);
  const latest = observed.at(-1);
  if ((type === 'cancellation' || type === 'schedule_change') && bookedOut !== null) {
    const offers = [...i.event.offers];
    if (type === 'schedule_change' && latest?.scheduledOut) {
      const moved = { ...i.segment, scheduledOut: latest.scheduledOut, scheduledIn: latest.scheduledIn };
      offers.push(journey ? journey.map((f) => (sameFlight(f, i.segment) ? moved : f)) : [moved]);
    }
    const end = journey?.[journey.length - 1] ?? null;
    const timed = offers.map((o) => headOfferTimes(o, segments, i.segment, journey, end?.destinationIata ?? null));
    if (timed.length > 0 && !timed.includes('unknown')) {
      const all = timed as HeadTimes[];
      const offer = headChooseOffer(all, bookedOut, noticeDays);
      if (offer) {
        out.early = Math.max(0, Math.floor((bookedOut - offer.leaves) / MINUTE));
        const planned = time(end?.scheduledIn ?? null);
        if (offer.arrives !== null && planned !== null) out.arrival = Math.max(0, Math.floor((offer.arrives - planned) / MINUTE));
        out.tie = all.some((o) => o !== offer && o.arrives !== null && o.arrives === offer.arrives && o.leaves !== offer.leaves);
      }
    }
  }
  return out;
}

/** HEAD read the departure from the first flight leaving the origin airport, even a booked one such as a listed copy of the cancelled flight (probe8). */
const headReadBookedDeparture = (i: SituationInput) =>
  i.event.offers.some((o) => {
    const departure = o.find((f) => f.originIata === i.segment.originIata);
    return departure !== undefined && i.booking.segments.some((b) => sameFlight(b, departure));
  });

// ---------------------------------------------------------------------------------------------------------------------
const PORTS = ['SFO', 'ORD', 'EWR', 'JFK', 'LIS', 'MAD', 'OPO'];
const CODES = ['UA', 'TP', 'AA', 'IB'];
const minutesOf = (iso: string | null) => (iso === null ? 0 : (Date.parse(iso) - B0) / MINUTE);

/** A random booking, disruption, and set of forwarded rebookings, from a seeded generator. */
function randomCase(rnd: () => number): SituationInput {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const maybe = (p: number) => rnd() < p;
  const span = () => 60 + Math.floor(rnd() * 400);
  // An outbound chain of one to three flights through distinct airports, and sometimes the return days later.
  const outbound: ItinerarySegment[] = [];
  const visited = new Set<string>();
  let airport = pick(PORTS);
  visited.add(airport);
  let t = Math.floor(rnd() * 300);
  for (let n = 1 + Math.floor(rnd() * 3); n > 0; n -= 1) {
    const to = pick(PORTS.filter((p) => !visited.has(p)));
    visited.add(to);
    const d = span();
    outbound.push(leg(pick(CODES), airport, to, t, maybe(0.03) ? null : t + d));
    airport = to;
    t += d + 30 + Math.floor(rnd() * 240);
  }
  const back: ItinerarySegment[] = [];
  if (maybe(0.4)) {
    let r = t + 5 * 24 * 60;
    for (const s of [...outbound].reverse()) {
      const d = span();
      back.push(leg(pick(CODES), s.destinationIata, s.originIata, r, r + d));
      r += d + 60 + Math.floor(rnd() * 180);
    }
  }
  const segments = [...outbound, ...back];
  const di = back.length > 0 && maybe(0.3) ? outbound.length + Math.floor(rnd() * back.length) : Math.floor(rnd() * outbound.length);
  const flight = segments[di];
  const journey = journeyOf(segments, flight);
  const destination = journey?.at(-1)?.destinationIata ?? flight.destinationIata;
  const type = maybe(0.67) ? 'cancellation' : 'schedule_change';

  const offers: ItinerarySegment[][] = [];
  for (let n = type === 'cancellation' ? 1 + Math.floor(rnd() * 3) : Math.floor(rnd() * 2); n > 0; n -= 1) {
    const o: ItinerarySegment[] = [];
    if (maybe(0.5)) o.push(...segments.slice(0, Math.floor(rnd() * (di + 2)))); // repeats booked flights, maybe the disrupted one
    const from = segments[Math.floor(rnd() * (di + 1))];
    let a = maybe(0.85) ? from.originIata : pick(PORTS);
    let m = minutesOf(from.scheduledOut) + Math.floor((rnd() - 0.4) * 300);
    const legs = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < legs; j += 1) {
      const to = j === legs - 1 && maybe(0.6) && destination !== a ? destination : pick(PORTS.filter((p) => p !== a));
      const d = span();
      const lookalike = maybe(0.08) ? flight.carrierIata : pick(CODES);
      o.push(leg(lookalike, a, to, maybe(0.03) ? null : m, maybe(0.03) ? null : m + d));
      a = to;
      m += d + Math.floor(rnd() * 150) - 15;
    }
    if (maybe(0.3)) o.push(...segments.slice(di + 1)); // the rest of the booking, return included
    if (maybe(0.08)) o.push(flight); // a listed copy of the disrupted flight after the new ones
    offers.push(o);
  }

  // When AeroAPI saw the original schedule decides the notice, and so the departure limit.
  const bookedOut = Date.parse(flight.scheduledOut!);
  const detected = bookedOut - Math.floor(rnd() * 20) * DAY - Math.floor(rnd() * DAY);
  const detectedAt = new Date(detected).toISOString();
  const observed: ObservedFlight[] = [];
  if (maybe(0.6)) observed.push(snapshot({ observedAt: new Date(detected - HOUR).toISOString(), scheduledOut: flight.scheduledOut }));
  if (type === 'cancellation') observed.push(snapshot({ observedAt: detectedAt, cancelled: true, scheduledOut: flight.scheduledOut }));
  else {
    const out = minutesOf(flight.scheduledOut) + Math.floor((rnd() - 0.5) * 300);
    const inn = out + span();
    observed.push(snapshot({ observedAt: detectedAt, scheduledOut: at(out), scheduledIn: at(inn) }));
  }
  return input(flight, segments, { type, offers, observed, detectedAt });
}

describe('acceptance across random offer sets (seeded)', () => {
  const cases = (() => {
    // mulberry32: exact 32-bit arithmetic. (A float LCG loses precision past 2^53 and cycles within ~10k draws.)
    let a = 20261002;
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: 2000 }, () => randomCase(rnd));
  })();

  it('draws 2,000 distinct cases', () => {
    expect(new Set(cases.map((c) => JSON.stringify(c))).size).toBe(2000);
  });

  it('reversing the order of the offers never changes either fact', () => {
    let compared = 0;
    for (const c of cases) {
      if (c.event.offers.length < 2) continue;
      compared += 1;
      const reversed = { ...c, event: { ...c.event, offers: [...c.event.offers].reverse() } };
      expect(facts(reversed), JSON.stringify(c.event.offers)).toEqual(facts(c));
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('every value HEAD 1c2c335 set is unchanged or now unset, unless HEAD read a booked departure or broke a tie by order', () => {
    const tally: Record<string, number> = {};
    const bump = (key: string) => (tally[key] = (tally[key] ?? 0) + 1);
    const unexplained: unknown[] = [];
    for (const c of cases) {
      const s = buildSituation(c);
      const head = headReroute(c, (s['event.notice_days'] as number | undefined) ?? null);
      for (const [fact, old] of [
        [EARLY, head.early],
        [ARRIVAL, head.arrival],
      ] as const) {
        const now = s[fact];
        if (old === undefined) bump(now === undefined ? `${fact} unset both` : `${fact} newly set`);
        else if (now === undefined) bump(`${fact} now unset`);
        else if (now === old) bump(`${fact} unchanged`);
        else {
          const why = headReadBookedDeparture(c) ? 'booked departure' : head.tie ? 'order-broken tie' : null;
          bump(`${fact} changed (${why ?? 'unexplained'})`);
          if (!why) unexplained.push({ fact, old, now, offers: c.event.offers, segments: c.booking.segments, flight: c.segment });
        }
      }
    }
    console.info('offer monotonic safety, 2000 cases:', JSON.stringify(tally));
    expect(unexplained).toEqual([]);
  });
});
