import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import { assess, incidentNumbers, summarizeEvent } from '@/lib/assist/assess';
import { checkCitations } from '@/lib/assist/citation-check';
import fixture from '../fixtures/rules-library.json';

describe('summarizeEvent', () => {
  it('says what happened in one line', () => {
    expect(summarizeEvent({ carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', departureLocal: '2026-11-03T18:15', eventType: 'cancellation', delayMinutes: null })).toBe(
      'TP 204 from EWR on Nov 3 was cancelled.',
    );
    expect(summarizeEvent({ carrierIata: 'A3', flightNumber: '349', originIata: 'ATH', departureLocal: '2026-11-05T11:00', eventType: 'delay', delayMinutes: 200 })).toBe(
      'A3 349 from ATH on Nov 5 is running 3 h 20 min late.',
    );
    expect(summarizeEvent({ carrierIata: 'A3', flightNumber: '349', originIata: 'ATH', departureLocal: '2026-11-05T11:00', eventType: 'delay', delayMinutes: null })).toBe(
      'A3 349 from ATH on Nov 5 was diverted.',
    );
    expect(summarizeEvent({ carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', departureLocal: '2026-11-03T18:15', eventType: 'schedule_change', delayMinutes: null })).toBe(
      'TP 204 from EWR on Nov 3 was moved to a new time.',
    );
  });

  it('words a delay in a form the citation check accepts for the incident minutes', () => {
    const playbook = (summary: string) => ({ summary, owed: [], steps: [], messages: [], caveats: [] });
    for (const minutes of [200, 120, 185, 45]) {
      const line = summarizeEvent({ carrierIata: 'A3', flightNumber: '349', originIata: 'ATH', departureLocal: '2026-11-05T11:00', eventType: 'delay', delayMinutes: minutes });
      expect(checkCitations(playbook(line), [], incidentNumbers(minutes)), line).toEqual([]);
    }
  });
});

describe('incidentNumbers', () => {
  it('offers the delay in minutes only: the citation check derives the hour forms', () => {
    expect(incidentNumbers(200)).toEqual(['200']);
    expect(incidentNumbers(null)).toEqual([]);
  });
});

describe('assess', () => {
  const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
  const tp204 = {
    carrier_iata: 'TP',
    operator_iata: 'TP',
    origin_iata: 'EWR',
    destination_iata: 'LIS',
    origin_country: 'US',
    destination_country: 'PT',
    scheduled_out: '2026-11-03T23:15:00Z',
    scheduled_in: '2026-11-04T06:35:00Z',
  };
  const base = {
    incident: { id: 'inc', event_type: 'cancellation' as const, delay_minutes: null, detected_at: '2026-11-01T12:00:00Z', facts: {}, raw_payload: {} },
    segment: { ...tp204, flight_number: '204', departure_local: '2026-11-03T18:15', distance_km: 5430, last_status: null, last_status_at: null },
    booking: { booked_via: null, booked_at: null, segments: [tp204] },
    offers: [],
    airports: {},
    asked: [],
    rules,
  };

  it('asks about the rebooking first, then applies the refund rule once answered', () => {
    expect(assess(base).question?.fact).toBe('passenger.accepted_alternative');
    const answered = assess({ ...base, incident: { ...base.incident, facts: { 'passenger.accepted_alternative': false } }, asked: ['passenger.accepted_alternative'] });
    expect(answered.applying.map((r) => r.id)).toEqual(['fixture-us-refund-cancelled-flight']);
    expect(answered.question).toBeNull();
  });

  it('does not ask again about a fact that was asked, even when the answer was “mixed” and left it unset', () => {
    const mixed = assess({ ...base, asked: ['passenger.accepted_alternative'] });
    expect(mixed.question?.fact).not.toBe('passenger.accepted_alternative');
    expect(mixed.situation).not.toHaveProperty('passenger.accepted_alternative');
  });

  it('ignores a stored answer that is not one of the options', () => {
    const forged = assess({ ...base, incident: { ...base.incident, facts: { 'event.reroute_arrival_delay_minutes': 7 } } });
    expect(forged.situation).not.toHaveProperty('event.reroute_arrival_delay_minutes');
  });

  it('cites only verified rules and keeps needs_review ones for caveats', () => {
    const result = assess({ ...base, incident: { ...base.incident, facts: { 'passenger.accepted_alternative': false } }, asked: ['passenger.accepted_alternative'] });
    expect(result.applying.every((rule) => rule.status === 'verified')).toBe(true);
    expect(result.reviewing.every((rule) => rule.status === 'needs_review')).toBe(true);
  });

  describe('AeroAPI snapshots', () => {
    // Task 9's FlightSnapshot: the one that raised the incident is in raw_payload, the latest in last_status.
    const snapshot = (estimatedOut: string, actualOut: string | null, cancelled = false) => ({
      faFlightId: 'TAP204-1',
      cancelled,
      diverted: false,
      scheduledOut: tp204.scheduled_out,
      estimatedOut,
      actualOut,
      scheduledIn: tp204.scheduled_in,
      estimatedIn: null,
      actualIn: null,
      arrivalDelayMinutes: null,
    });
    const airports = { EWR: { latitude: 40.6925, longitude: -74.1687 }, LIS: { latitude: 38.7813, longitude: -9.13592 } };

    it('reads the snapshots, the forwarded rebooking, and the airports into the EU261 facts', () => {
      const delayed = assess({
        ...base,
        incident: { ...base.incident, event_type: 'delay', delay_minutes: 200, raw_payload: { ...snapshot('2026-11-04T03:15:00Z', null), source: 'alert' } },
        segment: { ...base.segment, last_status: snapshot('2026-11-04T02:45:00Z', '2026-11-04T02:45:00Z'), last_status_at: '2026-11-04T03:00:00Z' },
        airports,
      });
      expect(delayed.situation).toMatchObject({ 'event.departure_delay_minutes': 240, 'flight.leg_distance_km': 5430, 'flight.distance_km': 5433, 'trip.journey_arrives_eu': true });

      const rebooked = assess({ ...base, offers: [[{ ...tp204, scheduled_out: '2026-11-04T23:15:00Z', scheduled_in: '2026-11-05T06:35:00Z' }]] });
      expect(rebooked.situation).toMatchObject({ 'event.reroute_departs_early_minutes': 0, 'event.reroute_arrival_delay_minutes': 1440 });
      expect(assess(base).situation).not.toHaveProperty('event.reroute_arrival_delay_minutes');
    });

    it('takes the operating carrier from operator_iata, not from the printed carrier', () => {
      const codeshare = { ...tp204, carrier_iata: 'KL', operator_iata: 'TP' };
      const viaCodeshare = assess({ ...base, segment: { ...base.segment, ...codeshare }, booking: { ...base.booking, segments: [codeshare] } });
      const unknown = assess({ ...base, segment: { ...base.segment, ...codeshare, operator_iata: null }, booking: { ...base.booking, segments: [{ ...codeshare, operator_iata: null }] } });
      expect(viaCodeshare.situation).not.toEqual(unknown.situation);
    });

    it('stamps the snapshots with when they were taken, so notice days are known only for a change we watched', () => {
      const original = snapshot(tp204.scheduled_out, null);
      // Seen on schedule early on Nov 1, cancelled when detected at noon: both bound the notice at 2 whole days before the Nov 3 departure.
      const watched = assess({
        ...base,
        incident: { ...base.incident, raw_payload: { ...snapshot(tp204.scheduled_out, null, true), source: 'poll' } },
        segment: { ...base.segment, last_status: original, last_status_at: '2026-11-01T06:00:00Z' },
      });
      expect(watched.situation['event.notice_days']).toBe(2);
      // A latest snapshot with no recorded time cannot count as a sighting before the change.
      const untimed = assess({
        ...base,
        incident: { ...base.incident, raw_payload: { ...snapshot(tp204.scheduled_out, null, true), source: 'poll' } },
        segment: { ...base.segment, last_status: original, last_status_at: null },
      });
      expect(untimed.situation).not.toHaveProperty('event.notice_days');
    });

    it('passes only the raw-payload snapshot when the segment has no latest status', () => {
      const result = assess({
        ...base,
        incident: { ...base.incident, event_type: 'delay', delay_minutes: 200, raw_payload: { ...snapshot('2026-11-04T03:15:00Z', null), source: 'alert' } },
      });
      expect(result.situation).toMatchObject({ 'event.departure_delay_minutes': 240 });
    });
  });
});
