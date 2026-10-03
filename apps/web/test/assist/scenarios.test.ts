import { matchRules, type Rule, type RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { buildSituation, type ItinerarySegment, type SituationInput } from '@/lib/assist/situation';

// Incidents match flight and money rules only, the same filter assess() applies.
const rules = ((fixture as unknown as RulesLibrary).rules as Rule[]).filter((r) => r.domain === 'flights' || r.domain === 'money');
const at = '2026-11-01T12:00:00Z';

/** A one-flight booking: the disrupted flight is the whole ticket. */
function nonstop(flight: SituationInput['segment']): ItinerarySegment[] {
  const { distanceKm: _distance, ...segment } = flight;
  return [segment];
}

/** An event as monitoring raises it, before any AeroAPI times or rebooking are attached. */
const event = (type: SituationInput['event']['type'], delayMinutes: number | null): SituationInput['event'] => ({ type, delayMinutes, detectedAt: at, observed: [], offers: [] });

const tokyo = { carrierIata: 'UA', operatorIata: 'UA', originIata: 'SFO', destinationIata: 'HND', originCountry: 'US', destinationCountry: 'JP', distanceKm: 8280, scheduledOut: '2026-11-21T18:00:00Z', scheduledIn: '2026-11-22T05:00:00Z' };
const paris = { carrierIata: 'DL', operatorIata: 'DL', originIata: 'JFK', destinationIata: 'CDG', originCountry: 'US', destinationCountry: 'FR', distanceKm: 5840, scheduledOut: '2026-11-10T23:00:00Z', scheduledIn: '2026-11-11T06:30:00Z' };
const santorini = { carrierIata: 'A3', operatorIata: 'A3', originIata: 'ATH', destinationIata: 'JTR', originCountry: 'GR', destinationCountry: 'GR', distanceKm: 230, scheduledOut: '2026-11-05T09:00:00Z', scheduledIn: '2026-11-05T09:50:00Z' };
const lisbon = { carrierIata: 'TP', operatorIata: 'TP', originIata: 'EWR', destinationIata: 'LIS', originCountry: 'US', destinationCountry: 'PT', distanceKm: 5430, scheduledOut: '2026-11-03T23:15:00Z', scheduledIn: '2026-11-04T06:35:00Z' };
const bali = { carrierIata: 'SQ', operatorIata: 'SQ', originIata: 'SIN', destinationIata: 'SFO', originCountry: 'SG', destinationCountry: 'US', distanceKm: 13590, scheduledOut: '2026-11-12T01:00:00Z', scheduledIn: '2026-11-12T16:00:00Z' };

const scenarios: { name: string; input: SituationInput; applies: string[]; mayApply: string[] }[] = [
  {
    name: 'Tokyo: UA 875 SFO→HND cancelled, nobody took the rebooking',
    input: {
      event: event('cancellation', null),
      segment: tokyo,
      booking: { bookedVia: null, bookedAt: null, segments: nonstop(tokyo) },
      airports: {},
      answers: { 'passenger.accepted_alternative': false },
    },
    applies: ['fixture-us-refund-cancelled-flight'],
    // A cancellation has no delay length, so the 6-hour card benefit stays "may apply" (not askable).
    mayApply: ['fixture-card-trip-delay'],
  },
  {
    name: 'Paris: DL 8606 JFK→CDG four hours late on a US carrier',
    input: {
      event: event('delay', 240),
      segment: paris,
      booking: { bookedVia: null, bookedAt: null, segments: nonstop(paris) },
      airports: {},
      answers: {},
    },
    applies: [],
    mayApply: [],
  },
  {
    name: 'Santorini: A3 349 ATH→JTR over three hours late',
    input: {
      event: event('delay', 200),
      segment: santorini,
      booking: { bookedVia: null, bookedAt: null, segments: nonstop(santorini) },
      airports: {},
      answers: {},
    },
    applies: ['fixture-eu261-delay-compensation'],
    mayApply: [],
  },
  {
    name: 'Lisbon: TP 204 EWR→LIS cancelled, rebooking answer unknown',
    input: {
      event: event('cancellation', null),
      segment: lisbon,
      booking: { bookedVia: null, bookedAt: null, segments: nonstop(lisbon) },
      airports: {},
      answers: {},
    },
    applies: [],
    mayApply: ['fixture-card-trip-delay', 'fixture-eu261-delay-compensation', 'fixture-us-refund-cancelled-flight'],
  },
  {
    name: 'Bali: SQ 32 SIN→SFO nearly seven hours late on a two-leg ticket',
    input: {
      event: event('delay', 410),
      segment: bali,
      booking: {
        bookedVia: null,
        bookedAt: null,
        segments: [
          { carrierIata: 'SQ', operatorIata: 'SQ', originIata: 'DPS', destinationIata: 'SIN', originCountry: 'ID', destinationCountry: 'SG', scheduledOut: '2026-11-11T13:00:00Z', scheduledIn: '2026-11-11T15:40:00Z' },
          ...nonstop(bali),
        ],
      },
      airports: {},
      answers: {},
    },
    applies: ['fixture-card-trip-delay'],
    mayApply: [],
  },
];

describe('ported trip-guide scenarios', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const results = matchRules(rules, buildSituation(scenario.input), { statuses: ['verified'] });
      expect(results.filter((r) => r.outcome === 'applies').map((r) => r.rule_id).sort()).toEqual(scenario.applies);
      expect(results.filter((r) => r.outcome === 'may_apply').map((r) => r.rule_id).sort()).toEqual(scenario.mayApply);
    });
  }
});
