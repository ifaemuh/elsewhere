import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { checkMember, requiredMonths } from '@/lib/documents/check';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];

describe('checkMember', () => {
  it('flags a passport that runs out too soon after the trip, without dates in the detail', () => {
    const checks = checkMember(rules, { 'trip.destination_country': 'PT', 'passenger.passport_months_valid_after_return': 2, 'flight.is_domestic_us': false });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ result: 'action_needed', rule: { id: 'fixture-passport-validity-pt' } });
    expect(checks[0].detail).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('reports unknown when the member has not entered their passport', () => {
    const checks = checkMember(rules, { 'trip.destination_country': 'PT', 'flight.is_domestic_us': false });
    expect(checks.map((c) => c.result)).toEqual(['unknown']);
  });

  it('reports all clear when nothing applies', () => {
    expect(checkMember(rules, { 'trip.destination_country': 'PT', 'passenger.passport_months_valid_after_return': 9, 'flight.is_domestic_us': false })).toEqual([
      { result: 'ok', rule: null, detail: 'No document issues found for this trip.' },
    ]);
  });

  it('reads the required months from the rule', () => {
    expect(requiredMonths(rules.find((r) => r.id === 'fixture-passport-validity-pt')!)).toBe(3);
  });
});
