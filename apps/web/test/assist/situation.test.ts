import { describe, expect, it } from 'vitest';
import { buildSituation, type ItinerarySegment, type ObservedFlight, type SituationInput } from '@/lib/assist/situation';

const AIRPORTS = {
  ORD: { latitude: 41.9786, longitude: -87.9048 },
  EWR: { latitude: 40.6925, longitude: -74.1687 },
  LIS: { latitude: 38.7813, longitude: -9.13592 },
};

describe('buildSituation', () => {
  it('fills every flight and trip fact it can', () => {
    expect(
      buildSituation({
        event: {
          type: 'cancellation',
          delayMinutes: null,
          detectedAt: '2026-11-01T12:00:00Z',
          observed: [],
          // The rebooking the airline sent: the same flight a day later.
          offers: [[{ carrierIata: 'TP', operatorIata: 'TP', originIata: 'EWR', destinationIata: 'LIS', originCountry: 'US', destinationCountry: 'PT', scheduledOut: '2026-11-04T23:15:00Z', scheduledIn: '2026-11-05T06:35:00Z' }]],
        },
        segment: { carrierIata: 'TP', operatorIata: 'TP', originIata: 'EWR', destinationIata: 'LIS', originCountry: 'US', destinationCountry: 'PT', distanceKm: 5433, scheduledOut: '2026-11-03T23:15:00Z', scheduledIn: '2026-11-04T06:35:00Z' },
        booking: {
          bookedVia: 'Expedia',
          bookedAt: '2026-10-01',
          segments: [{ carrierIata: 'TP', operatorIata: 'TP', originIata: 'EWR', destinationIata: 'LIS', originCountry: 'US', destinationCountry: 'PT', scheduledOut: '2026-11-03T23:15:00Z', scheduledIn: '2026-11-04T06:35:00Z' }],
        },
        airports: AIRPORTS,
        answers: { 'passenger.accepted_alternative': false },
      }),
    ).toEqual({
      'event.type': 'cancellation',
      'event.at_us_airport': true,
      'event.reroute_departs_early_minutes': 0,
      'event.reroute_arrival_delay_minutes': 1440,
      'flight.carrier_iata': 'TP',
      'flight.carrier_is_us': false,
      'flight.carrier_is_eu': true,
      'flight.departs_us': true,
      'flight.departs_eu': false,
      'flight.departs_iceland_norway_switzerland': false,
      'flight.departs_uk': false,
      'flight.arrives_eu': true,
      'flight.touches_us': true,
      'flight.is_domestic_us': false,
      'flight.leg_distance_km': 5433,
      'flight.distance_km': 5433,
      'trip.booked_via': 'ota',
      'trip.touches_us': true,
      'trip.itinerary_domestic_us': false,
      'trip.booked_with_us_carrier': false,
      'trip.us_foreign_nonstop_minutes': 440,
      'trip.hours_booked_before_departure': 779,
      'trip.journey_departs_eu': false,
      'trip.journey_arrives_eu': true,
      'passenger.accepted_alternative': false,
    });
  });

  it('leaves unknown facts out instead of guessing', () => {
    const unresolved = { carrierIata: 'UA', operatorIata: 'UA', originCountry: null, destinationCountry: null, scheduledOut: null, scheduledIn: null };
    const feeder = { ...unresolved, originIata: 'ORD', destinationIata: 'EWR' };
    const situation = buildSituation({
      event: { type: 'delay', delayMinutes: 200, detectedAt: '2026-11-03T20:00:00Z', observed: [], offers: [] },
      segment: { ...feeder, distanceKm: null },
      booking: { bookedVia: null, bookedAt: '2026-10-01', segments: [feeder, { ...unresolved, originIata: 'EWR', destinationIata: 'LIS' }] },
      airports: {},
      answers: {},
    });
    expect(situation).toEqual({
      'event.type': 'delay',
      'event.delay_minutes': 200,
      'flight.carrier_iata': 'UA',
      'flight.carrier_is_us': true,
      'flight.carrier_is_eu': false,
      'trip.booked_via': 'direct',
      'trip.booked_with_us_carrier': true,
    });
  });
});

const COUNTRY: Record<string, string> = { ORD: 'US', EWR: 'US', SJU: 'PR', LIS: 'PT', CDG: 'FR', PTP: 'GP', KEF: 'IS', ZRH: 'CH', FAE: 'FO', GOH: 'GL' };
const leg = (carrierIata: string, originIata: string, destinationIata: string, scheduledOut: string | null, scheduledIn: string | null): ItinerarySegment => ({
  carrierIata,
  operatorIata: carrierIata,
  originIata,
  destinationIata,
  originCountry: COUNTRY[originIata] ?? null,
  destinationCountry: COUNTRY[destinationIata] ?? null,
  scheduledOut,
  scheduledIn,
});
// ORD → EWR → LIS and back, all on one ticket.
const roundTrip = [
  leg('UA', 'ORD', 'EWR', '2026-11-03T18:00:00Z', '2026-11-03T20:30:00Z'),
  leg('TP', 'EWR', 'LIS', '2026-11-03T23:15:00Z', '2026-11-04T06:35:00Z'),
  leg('TP', 'LIS', 'EWR', '2026-11-10T12:00:00Z', '2026-11-10T20:20:00Z'),
  leg('UA', 'EWR', 'ORD', '2026-11-10T23:00:00Z', '2026-11-11T01:45:00Z'),
];
const situation = (
  flight: ItinerarySegment,
  segments: ItinerarySegment[],
  extra: {
    bookedAt?: string;
    type?: SituationInput['event']['type'];
    observed?: ObservedFlight[];
    offers?: ItinerarySegment[][];
    distanceKm?: number;
    airports?: SituationInput['airports'];
  } = {},
) =>
  buildSituation({
    event: { type: extra.type ?? 'delay', delayMinutes: null, detectedAt: '2026-11-01T12:00:00Z', observed: extra.observed ?? [], offers: extra.offers ?? [] },
    segment: { ...flight, distanceKm: extra.distanceKm ?? null },
    booking: { bookedVia: null, bookedAt: extra.bookedAt ?? null, segments },
    airports: extra.airports ?? {},
    answers: {},
  });
/** What AeroAPI shows for a flight: its schedule, the airline's estimate, and when it actually left. */
const seen = (flight: ItinerarySegment, change: Partial<ObservedFlight> = {}): ObservedFlight => ({
  observedAt: '2026-11-01T10:00:00Z',
  cancelled: false,
  diverted: false,
  scheduledOut: flight.scheduledOut,
  estimatedOut: flight.scheduledOut,
  actualOut: null,
  scheduledIn: flight.scheduledIn,
  ...change,
});

describe('itinerary facts', () => {
  it('treats a domestic connection on an international ticket as part of an international itinerary', () => {
    const s = situation(roundTrip[0], roundTrip);
    expect(s['flight.is_domestic_us']).toBe(true);
    expect(s['trip.itinerary_domestic_us']).toBe(false);
    expect(s['trip.touches_us']).toBe(true);
  });

  it('calls a U.S.-only ticket, territories included, a domestic itinerary', () => {
    const domestic = [roundTrip[0], leg('UA', 'EWR', 'SJU', '2026-11-04T01:00:00Z', '2026-11-04T05:10:00Z')];
    expect(situation(domestic[0], domestic)['trip.itinerary_domestic_us']).toBe(true);
  });

  it('leaves the itinerary facts unset while a country is unknown', () => {
    const partial = [roundTrip[0], { ...leg('UA', 'EWR', 'SJU', '2026-11-04T01:00:00Z', null), destinationCountry: null }];
    const s = situation(partial[0], partial);
    expect(s).not.toHaveProperty('trip.itinerary_domestic_us');
    expect(s).not.toHaveProperty('trip.us_foreign_nonstop_minutes');
    expect(s['trip.touches_us']).toBe(true);
  });

  it('times the U.S.–foreign nonstop on the same journey as the disrupted flight', () => {
    expect(situation(roundTrip[0], roundTrip)['trip.us_foreign_nonstop_minutes']).toBe(440);
    expect(situation(roundTrip[3], roundTrip)['trip.us_foreign_nonstop_minutes']).toBe(500);
  });

  it('counts hours booked ahead from the latest moment the printed booking time can mean', () => {
    expect(situation(roundTrip[1], roundTrip, { bookedAt: '2026-10-01' })['trip.hours_booked_before_departure']).toBe(774);
    expect(situation(roundTrip[1], roundTrip, { bookedAt: '2026-10-27T09:30' })['trip.hours_booked_before_departure']).toBe(164);
    expect(situation(roundTrip[1], roundTrip)).not.toHaveProperty('trip.hours_booked_before_departure');
  });

  it('knows the booking airline only when every flight on the booking agrees', () => {
    expect(situation(roundTrip[0], [roundTrip[0], roundTrip[3]])['trip.booked_with_us_carrier']).toBe(true);
    expect(situation(roundTrip[1], [roundTrip[1], roundTrip[2]])['trip.booked_with_us_carrier']).toBe(false);
    expect(situation(roundTrip[0], roundTrip)).not.toHaveProperty('trip.booked_with_us_carrier');
  });

  it('places a cancellation, a delay, or a schedule change at the departure airport, and leaves a diversion unplaced', () => {
    expect(situation(roundTrip[1], roundTrip, { type: 'cancellation' })['event.at_us_airport']).toBe(true);
    expect(situation(roundTrip[2], roundTrip, { type: 'delay' })['event.at_us_airport']).toBe(false);
    expect(situation(roundTrip[1], roundTrip, { type: 'schedule_change' })['event.at_us_airport']).toBe(true);
    // Task 9 records a diversion as a delay; the travelers are wherever the aircraft landed.
    expect(situation(roundTrip[1], roundTrip, { observed: [seen(roundTrip[1], { diverted: true })] })).not.toHaveProperty('event.at_us_airport');
  });

  it('never sets passenger.volunteered itself; only the planner’s answer does', () => {
    expect(situation(roundTrip[1], roundTrip)).not.toHaveProperty('passenger.volunteered');
  });
});

describe('EU261 facts', () => {
  it('reports the longer of the airline’s expected departure delay and the actual one, for that flight only', () => {
    const flight = roundTrip[1]; // scheduled to leave EWR at 23:15
    // AeroAPI expected 03:15 (4 hours late), then the flight left at 02:45: the 4 hours the airline expected count.
    const shrank = [seen(flight, { estimatedOut: '2026-11-04T03:15:00Z' }), seen(flight, { estimatedOut: '2026-11-04T02:45:00Z', actualOut: '2026-11-04T02:45:00Z' })];
    expect(situation(flight, roundTrip, { observed: shrank })['event.departure_delay_minutes']).toBe(240);
    // Expected 1 hour late, then it left 3 h 05 min late: the actual delay counts.
    const grew = [seen(flight, { estimatedOut: '2026-11-04T00:15:00Z' }), seen(flight, { estimatedOut: '2026-11-04T02:20:00Z', actualOut: '2026-11-04T02:20:00Z' })];
    expect(situation(flight, roundTrip, { observed: grew })['event.departure_delay_minutes']).toBe(185);
    expect(situation(flight, roundTrip)).not.toHaveProperty('event.departure_delay_minutes');
    expect(situation(flight, roundTrip, { type: 'cancellation', observed: shrank })).not.toHaveProperty('event.departure_delay_minutes');
  });

  it('measures the disrupted flight and its whole journey separately', () => {
    const outbound = situation(roundTrip[1], roundTrip, { distanceKm: 5430, airports: AIRPORTS });
    expect(outbound['flight.leg_distance_km']).toBe(5430);
    // ORD to LIS in whole km, the journey's first departure to its final destination.
    expect(outbound['flight.distance_km']).toBe(6435);
    expect(situation(roundTrip[3], roundTrip, { airports: AIRPORTS })['flight.distance_km']).toBe(6435);
    expect(situation(roundTrip[1], roundTrip, { airports: { EWR: AIRPORTS.EWR, LIS: AIRPORTS.LIS } })).not.toHaveProperty('flight.distance_km');
    expect(situation(roundTrip[1], roundTrip)).not.toHaveProperty('flight.leg_distance_km');
  });

  it('scopes EU departure and arrival to the journey in the disrupted flight’s direction', () => {
    expect(situation(roundTrip[0], roundTrip)).toMatchObject({
      'flight.departs_eu': false,
      'flight.arrives_eu': false,
      'trip.journey_departs_eu': false,
      'trip.journey_arrives_eu': true,
    });
    expect(situation(roundTrip[3], roundTrip)).toMatchObject({ 'trip.journey_departs_eu': true, 'trip.journey_arrives_eu': false });
    // While a connection's times are unknown, so is where the journey ends.
    const unresolved = [roundTrip[0], { ...roundTrip[1], scheduledOut: null, scheduledIn: null }];
    expect(situation(roundTrip[0], unresolved)).not.toHaveProperty('trip.journey_arrives_eu');
  });

  it('counts EU states with their outermost regions, and Iceland, Norway, and Switzerland apart', () => {
    const departing = (originIata: string) => {
      const flight = leg('FI', originIata, 'EWR', '2026-11-03T08:00:00Z', '2026-11-03T16:00:00Z');
      return situation(flight, [flight]);
    };
    expect(departing('CDG')).toMatchObject({ 'flight.departs_eu': true, 'flight.departs_iceland_norway_switzerland': false });
    expect(departing('PTP')).toMatchObject({ 'flight.departs_eu': true, 'flight.departs_iceland_norway_switzerland': false });
    expect(departing('KEF')).toMatchObject({ 'flight.departs_eu': false, 'flight.departs_iceland_norway_switzerland': true });
    expect(departing('ZRH')).toMatchObject({ 'flight.departs_eu': false, 'flight.departs_iceland_norway_switzerland': true });
    expect(departing('FAE')).toMatchObject({ 'flight.departs_eu': false, 'flight.departs_iceland_norway_switzerland': false });
    expect(departing('GOH')).toMatchObject({ 'flight.departs_eu': false, 'flight.departs_iceland_norway_switzerland': false });
  });

  it('measures how far a schedule change moved the departure earlier, and 0 when it moved later', () => {
    const flight = roundTrip[1];
    const moved = (scheduledOut: string, scheduledIn: string) => [seen(flight, { scheduledOut, estimatedOut: scheduledOut, scheduledIn })];
    expect(situation(flight, roundTrip, { type: 'schedule_change', observed: moved('2026-11-03T21:45:00Z', '2026-11-04T05:05:00Z') })['event.departure_moved_earlier_minutes']).toBe(90);
    expect(situation(flight, roundTrip, { type: 'schedule_change', observed: moved('2026-11-04T01:15:00Z', '2026-11-04T08:35:00Z') })['event.departure_moved_earlier_minutes']).toBe(0);
    expect(situation(flight, roundTrip, { type: 'schedule_change' })).not.toHaveProperty('event.departure_moved_earlier_minutes');
    expect(situation(flight, roundTrip, { observed: moved('2026-11-03T21:45:00Z', '2026-11-04T05:05:00Z') })).not.toHaveProperty('event.departure_moved_earlier_minutes');
  });

  it('treats the changed flight as the re-routing offer for a schedule change', () => {
    const change = (flight: ItinerarySegment, scheduledOut: string, scheduledIn: string) =>
      situation(flight, roundTrip, { type: 'schedule_change', observed: [seen(flight, { scheduledOut, estimatedOut: scheduledOut, scheduledIn })] });
    expect(change(roundTrip[1], '2026-11-03T21:45:00Z', '2026-11-04T05:05:00Z')).toMatchObject({
      'event.reroute_departs_early_minutes': 90,
      'event.reroute_arrival_delay_minutes': 0,
    });
    expect(change(roundTrip[1], '2026-11-04T01:15:00Z', '2026-11-04T08:35:00Z')).toMatchObject({
      'event.reroute_departs_early_minutes': 0,
      'event.reroute_arrival_delay_minutes': 120,
    });
    // A changed feeder that still makes its connection leaves the arrival in LIS as booked.
    expect(change(roundTrip[0], '2026-11-03T19:00:00Z', '2026-11-03T21:30:00Z')).toMatchObject({
      'event.reroute_departs_early_minutes': 0,
      'event.reroute_arrival_delay_minutes': 0,
    });
    // One that lands after the connection leaves gives an itinerary that contradicts itself, so neither is known.
    const missed = change(roundTrip[0], '2026-11-03T22:30:00Z', '2026-11-04T01:00:00Z');
    expect(missed).not.toHaveProperty('event.reroute_departs_early_minutes');
    expect(missed).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });

  it('reads a cancellation’s re-routing from a forwarded rebooking, and leaves it unset until one is known', () => {
    // The rebooking repeats the unchanged feeder, then the new flight a day later.
    const rebooking = [roundTrip[0], leg('TP', 'EWR', 'LIS', '2026-11-04T23:15:00Z', '2026-11-05T06:35:00Z')];
    expect(situation(roundTrip[1], roundTrip, { type: 'cancellation', offers: [rebooking] })).toMatchObject({
      'event.reroute_departs_early_minutes': 0,
      'event.reroute_arrival_delay_minutes': 1440,
    });
    const unknown = situation(roundTrip[1], roundTrip, { type: 'cancellation' });
    expect(unknown).not.toHaveProperty('event.reroute_departs_early_minutes');
    expect(unknown).not.toHaveProperty('event.reroute_arrival_delay_minutes');
    expect(situation(roundTrip[1], roundTrip, { type: 'delay', offers: [rebooking] })).not.toHaveProperty('event.reroute_departs_early_minutes');
  });

  it('reports, of several offers, the soonest arrival among those leaving within the notice limit', () => {
    const offer = (scheduledOut: string, scheduledIn: string) => [leg('TP', 'EWR', 'LIS', scheduledOut, scheduledIn)];
    // Told 2 days ahead, so the limit is 1 hour early. The 2-hours-early flight arrives soonest, but is outside it.
    const offers = [offer('2026-11-03T21:15:00Z', '2026-11-04T04:35:00Z'), offer('2026-11-04T10:00:00Z', '2026-11-04T17:20:00Z'), offer('2026-11-03T22:45:00Z', '2026-11-04T06:05:00Z')];
    expect(situation(roundTrip[1], roundTrip, { type: 'cancellation', offers })).toMatchObject({
      'event.reroute_departs_early_minutes': 30,
      'event.reroute_arrival_delay_minutes': 0,
    });
    // With no offer inside the limit, any is reported.
    expect(situation(roundTrip[1], roundTrip, { type: 'cancellation', offers: [offers[0]] })['event.reroute_departs_early_minutes']).toBe(120);
  });
});
