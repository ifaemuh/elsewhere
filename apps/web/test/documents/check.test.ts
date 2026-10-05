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

import { documentRulesCover } from '@/lib/documents/check';

describe('documentRulesCover', () => {
  it('is false for an empty library', () => {
    expect(documentRulesCover([], { 'trip.destination_country': 'PT', 'flight.is_domestic_us': false })).toBe(false);
  });
  it('is false when only other destinations are covered', () => {
    expect(documentRulesCover(rules, { 'trip.destination_country': 'JP', 'flight.is_domestic_us': false })).toBe(false);
  });
  it('is true when a verified document rule fits the destination', () => {
    expect(documentRulesCover(rules, { 'trip.destination_country': 'PT', 'flight.is_domestic_us': false })).toBe(true);
  });
  it('is true for a domestic trip, which REAL ID covers', () => {
    expect(documentRulesCover(rules, { 'flight.is_domestic_us': true })).toBe(true);
  });
  it('counts a rule that may apply because facts are missing', () => {
    expect(documentRulesCover(rules, { 'trip.destination_country': 'PT' })).toBe(true);
  });
});

import { PASSPORT_GAP_DETAIL, referencesFact } from '@/lib/documents/check';

describe('checkMember passport coverage gap', () => {
  const base = rules.find((r) => r.id === 'fixture-passport-validity-pt')!;
  const gated = (id: string, countries: string[]): Rule => ({
    ...base,
    id,
    title: `Gated ${id}`,
    applies_when: { all: [{ fact: 'trip.destination_country', in: ['GB'] }, { fact: 'passenger.nationality', in: countries }] },
  } as Rule);
  const eta = gated('gated-eta', ['US', 'CA', 'AU']);
  const visa = gated('gated-visa', ['US', 'CA']);
  const gb = { 'trip.destination_country': 'GB', 'flight.is_domestic_us': false };

  it('gives an unlisted nationality the gap check and never ok', () => {
    const checks = checkMember([eta], { ...gb, 'passenger.nationality': 'FR' });
    expect(checks).toEqual([{ result: 'unknown', rule: null, detail: PASSPORT_GAP_DETAIL }]);
  });
  it('still gives a listed nationality action_needed', () => {
    const checks = checkMember([eta], { ...gb, 'passenger.nationality': 'US' });
    expect(checks).toMatchObject([{ result: 'action_needed', rule: { id: 'gated-eta' } }]);
  });
  it('keeps unknown with the rule when nationality is missing', () => {
    const checks = checkMember([eta], gb);
    expect(checks).toMatchObject([{ result: 'unknown', rule: { id: 'gated-eta' } }]);
  });
  it('leaves rules without a nationality condition as ok', () => {
    const checks = checkMember(rules, { 'trip.destination_country': 'PT', 'passenger.passport_months_valid_after_return': 9, 'passenger.nationality': 'FR', 'flight.is_domestic_us': false });
    expect(checks).toEqual([{ result: 'ok', rule: null, detail: 'No document issues found for this trip.' }]);
  });
  it('adds only one gap check for two gated rules', () => {
    const checks = checkMember([eta, visa], { ...gb, 'passenger.nationality': 'FR' });
    expect(checks).toHaveLength(1);
    expect(checks[0].detail).toBe(PASSPORT_GAP_DETAIL);
  });
  it('coexists with action_needed from another rule', () => {
    const checks = checkMember([eta, base], { 'trip.destination_country': 'GB', 'passenger.nationality': 'FR', 'flight.is_domestic_us': false });
    expect(checks).toEqual([{ result: 'unknown', rule: null, detail: PASSPORT_GAP_DETAIL }]);
    const both = checkMember([eta, { ...base, applies_when: { all: [{ fact: 'trip.destination_country', in: ['GB'] }] } } as Rule], { ...gb, 'passenger.nationality': 'FR' });
    expect(both.map((c) => c.result).sort()).toEqual(['action_needed', 'unknown']);
  });

  const fr = { ...gb, 'passenger.nationality': 'FR' };
  const gap = [{ result: 'unknown', rule: null, detail: PASSPORT_GAP_DETAIL }];

  it('still gaps an unlisted passport when the rule also has a passport-months condition', () => {
    const us = { ...base, id: 'us-only-months', applies_when: { all: [{ fact: 'trip.destination_country', in: ['GB'] }, { fact: 'passenger.nationality', in: ['US'] }, { fact: 'passenger.passport_months_valid_after_return', lt: 6 }] } } as Rule;
    expect(checkMember([us], { ...fr, 'passenger.passport_months_valid_after_return': 9 })).toEqual(gap);
  });
  it('gives a US member only the ETA action when another rule is scoped to CN and IN', () => {
    const cnIn = gated('gated-cn-in', ['CN', 'IN']);
    const checks = checkMember([eta, cnIn], { ...gb, 'passenger.nationality': 'US' });
    expect(checks).toMatchObject([{ result: 'action_needed', rule: { id: 'gated-eta' } }]);
  });
  it('gives a nationality that no scoped rule lists the gap, not a CN or IN rule match', () => {
    expect(checkMember([eta, gated('gated-cn-in', ['CN', 'IN'])], fr)).toEqual(gap);
  });
  it('gives no gap to a British passport going to GB', () => {
    expect(checkMember([gated('gated-eta', ['US'])], { ...gb, 'passenger.nationality': 'GB' })).toEqual([{ result: 'ok', rule: null, detail: 'No document issues found for this trip.' }]);
  });
  it('gives no gap to a British passport going to Jersey', () => {
    const je = { ...eta, applies_when: { all: [{ fact: 'trip.destination_country', in: ['GB', 'JE'] }, { fact: 'passenger.nationality', in: ['US'] }] } } as Rule;
    expect(checkMember([je], { 'trip.destination_country': 'JE', 'passenger.nationality': 'GB', 'flight.is_domestic_us': false })[0].result).toBe('ok');
    expect(checkMember([je], { 'trip.destination_country': 'JE', 'passenger.nationality': 'FR', 'flight.is_domestic_us': false })).toEqual(gap);
  });
  it('gives no gap when the destination is unknown', () => {
    expect(checkMember([eta], { 'passenger.nationality': 'FR' })[0].result).toBe('ok');
  });
  it('gives no gap when the rule is for another destination', () => {
    expect(checkMember([eta], { 'trip.destination_country': 'PT', 'passenger.nationality': 'FR', 'flight.is_domestic_us': false })[0].result).toBe('ok');
  });
});

describe('referencesFact', () => {
  const n = { fact: 'passenger.nationality', in: ['US'] } as const;
  const d = { fact: 'trip.destination_country', in: ['GB'] } as const;
  it('finds a top-level and a deeply nested reference', () => {
    expect(referencesFact({ all: [d, n] } as never, 'passenger.nationality')).toBe(true);
    expect(referencesFact({ all: [d, { any: [d, { all: [d, n] }] }] } as never, 'passenger.nationality')).toBe(true);
  });
  it('is false when the fact is absent', () => {
    expect(referencesFact({ all: [d, { any: [d] }] } as never, 'passenger.nationality')).toBe(false);
  });
});
