import type { MatchResult } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import { buildSituation } from '@/lib/assist/situation';
import { answerValue, nextQuestion, PlannerAnswerError } from '@/lib/assist/questions';

const mayApply = (rule_id: string, missing_facts: string[]): MatchResult =>
  ({ rule_id, rule_version: 1, outcome: 'may_apply', missing_facts }) as MatchResult;

describe('nextQuestion', () => {
  it('asks about the rebooking before the cause, and only about askable facts', () => {
    const results = [mayApply('a', ['event.delay_minutes']), mayApply('b', ['event.cause', 'passenger.accepted_alternative'])];
    expect(nextQuestion(results, [])?.fact).toBe('passenger.accepted_alternative');
    expect(nextQuestion(results, ['passenger.accepted_alternative'])?.fact).toBe('event.cause');
    expect(nextQuestion(results, ['passenger.accepted_alternative', 'event.cause'])).toBeNull();
  });

  it('asks whether anyone volunteered their seat when a rule turns on it', () => {
    expect(nextQuestion([mayApply('bumping', ['passenger.volunteered'])], [])).toMatchObject({
      fact: 'passenger.volunteered',
      options: [{ value: 'false' }, { value: 'true' }, { value: 'mixed' }],
    });
  });

  it('asks about the airline’s new flight, arrival first, right after the rebooking question', () => {
    const results = [
      mayApply('eu261-cancellation', ['event.reroute_departs_early_minutes', 'event.reroute_arrival_delay_minutes', 'event.cause']),
      mayApply('refund', ['passenger.accepted_alternative']),
    ];
    expect(nextQuestion(results, [])?.fact).toBe('passenger.accepted_alternative');
    expect(nextQuestion(results, ['passenger.accepted_alternative'])?.fact).toBe('event.reroute_arrival_delay_minutes');
    expect(nextQuestion(results, ['passenger.accepted_alternative', 'event.reroute_arrival_delay_minutes'])?.fact).toBe('event.reroute_departs_early_minutes');
  });

  it('answers each re-routing band with its smallest value, and "no offer" as the contract says', () => {
    const arrival = nextQuestion([mayApply('x', ['event.reroute_arrival_delay_minutes'])], []);
    expect(arrival?.options.map((o) => o.value)).toEqual(['0', '1', '120', '180', '240', '1440']);
    const departure = nextQuestion([mayApply('x', ['event.reroute_departs_early_minutes'])], []);
    expect(departure?.options.map((o) => o.value)).toEqual(['0', '1', '61', '121']);
  });

  it('asks nothing when nothing is uncertain', () => {
    expect(nextQuestion([{ rule_id: 'x', rule_version: 1, outcome: 'applies', missing_facts: [] } as MatchResult], [])).toBeNull();
  });
});

describe('answerValue', () => {
  it('turns yes/no answers into booleans, and number facts into numbers', () => {
    expect(answerValue({ fact: 'passenger.accepted_alternative', value: 'false' })).toBe(false);
    expect(answerValue({ fact: 'event.cause', value: 'controllable' })).toBe('controllable');
    expect(answerValue({ fact: 'event.reroute_arrival_delay_minutes', value: '120' })).toBe(120);
  });
});

describe('answerValue validation and mixed groups (fix round 1, items 7 and 8)', () => {
  it('throws a typed error for an empty string, junk, an unknown fact, or an off-list value', () => {
    for (const answer of [
      { fact: 'event.reroute_arrival_delay_minutes', value: '' },
      { fact: 'event.reroute_arrival_delay_minutes', value: 'abc' },
      { fact: 'event.reroute_arrival_delay_minutes', value: '121' },
      { fact: 'passenger.volunteered', value: 'yes' },
      { fact: 'event.cause', value: 'weather' },
      { fact: 'event.delay_minutes', value: '600' },
      { fact: 'not.a.fact', value: 'x' },
    ]) {
      expect(() => answerValue(answer), JSON.stringify(answer)).toThrow(PlannerAnswerError);
    }
  });

  it('offers "some of us did, some didn’t" on the two yes/no questions, and it leaves the fact unset', () => {
    for (const fact of ['passenger.accepted_alternative', 'passenger.volunteered']) {
      const question = nextQuestion([mayApply('x', [fact])], []);
      expect(question?.options.at(-1)).toEqual({ value: 'mixed', label: 'Some of us did, some didn’t' });
      expect(answerValue({ fact, value: 'mixed' })).toBeUndefined();
      // Answered but still unset: the fact is in alreadyAsked, so the planner is not asked again.
      expect(nextQuestion([mayApply('x', [fact])], [fact])).toBeNull();
    }
  });

  it('words the rebooking question to include the changed flight, and the bands without overlap', () => {
    expect(nextQuestion([mayApply('x', ['passenger.accepted_alternative'])], [])?.prompt).toContain('the changed flight');
    const labels = nextQuestion([mayApply('x', ['event.reroute_arrival_delay_minutes'])], [])?.options.map((o) => o.label);
    expect(labels).toContain('3 hours or more but under 4 hours later');
  });
});

describe('who charged for the ticket (trip.ticket_charged_by)', () => {
  it('asks it in plain words, with a not-sure option that leaves the fact unset', () => {
    const question = nextQuestion([mayApply('airline-commitment', ['trip.ticket_charged_by'])], []);
    expect(question?.prompt).toBe('Who charged your card for the flights: the airline, or a travel agency or booking site?');
    expect(question?.options).toEqual([
      { value: 'airline', label: 'The airline' },
      { value: 'ticket_agent', label: 'A travel agency or booking site' },
      { value: 'mixed', label: 'Not sure' },
    ]);
    expect(answerValue({ fact: 'trip.ticket_charged_by', value: 'mixed' })).toBeUndefined();
  });

  it('turns an answer into the enum string, and rejects anything else', () => {
    expect(answerValue({ fact: 'trip.ticket_charged_by', value: 'ticket_agent' })).toBe('ticket_agent');
    expect(() => answerValue({ fact: 'trip.ticket_charged_by', value: 'ota' })).toThrow(PlannerAnswerError);
  });

  it('flows into the situation as a string, and never from a stored "mixed"', () => {
    const base = (answers: Record<string, string>) => {
      const leg = { carrierIata: 'AA', operatorIata: 'AA', originIata: 'ORD', destinationIata: 'EWR', originCountry: 'US', destinationCountry: 'US', scheduledOut: null, scheduledIn: null };
      return buildSituation({
        event: { type: 'delay', delayMinutes: null, detectedAt: '2026-11-01T12:00:00Z', observed: [], offers: [] },
        segment: { ...leg, distanceKm: null },
        booking: { bookedVia: null, bookedAt: null, segments: [leg] },
        airports: {},
        answers,
      });
    };
    expect(base({ 'trip.ticket_charged_by': 'airline' })['trip.ticket_charged_by']).toBe('airline');
    expect('trip.ticket_charged_by' in base({ 'trip.ticket_charged_by': 'mixed' })).toBe(false);
    expect('trip.ticket_charged_by' in base({ 'trip.ticket_charged_by': 'ota' })).toBe(false);
  });
});
