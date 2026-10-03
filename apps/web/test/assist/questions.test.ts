import type { MatchResult } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import { answerValue, nextQuestion } from '@/lib/assist/questions';

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
      options: [{ value: 'false' }, { value: 'true' }],
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
