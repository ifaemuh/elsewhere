import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { checkCitations } from '@/lib/assist/citation-check';
import type { Playbook } from '@/lib/assist/playbook-schema';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const eu = rules.find((r) => r.id === 'fixture-eu261-delay-compensation')!;
const refund = rules.find((r) => r.id === 'fixture-us-refund-cancelled-flight')!;

const base: Playbook = {
  summary: 'A3 349 landed 3 hours 20 minutes late.',
  owed: [{ text: 'Up to €250 in compensation, paid within 7 days of a valid claim.', rule_ids: [eu.id] }],
  steps: [{ text: 'Write to Aegean today.', rule_ids: [] }],
  messages: [{ to: 'airline', channel: 'email', body: 'Flight A3 349 on Nov 5 arrived 3 hours late. Please pay EU261 compensation of €250.', rule_ids: [eu.id] }],
  caveats: [],
};

describe('checkCitations', () => {
  it('passes amounts and durations that come from the cited rule or the incident', () => {
    expect(checkCitations(base, [eu], ['3'])).toEqual([]);
  });

  it('fails an owed item without a rule id', () => {
    const issues = checkCitations({ ...base, owed: [{ text: 'Compensation.', rule_ids: [] }] }, [eu], ['3']);
    expect(issues).toContainEqual(expect.objectContaining({ path: 'owed[0]', problem: 'missing_rule_id' }));
  });

  it('fails a citation to a rule outside the verified matched set', () => {
    const issues = checkCitations(base, [refund], ['3']);
    expect(issues.some((i) => i.problem === 'rule_not_allowed' && i.detail === eu.id)).toBe(true);
  });

  it('fails an amount that is not in the rule', () => {
    const issues = checkCitations({ ...base, owed: [{ text: 'You are owed €800.', rule_ids: [eu.id] }] }, [eu], ['3']);
    expect(issues).toContainEqual({ path: 'owed[0]', problem: 'number_not_in_rule', detail: '800' });
  });

  it('fails a deadline that is not in the rule', () => {
    const issues = checkCitations({ ...base, messages: [{ ...base.messages[0], body: 'Pay within 30 days.' }] }, [eu], ['3']);
    expect(issues).toContainEqual({ path: 'messages[0]', problem: 'number_not_in_rule', detail: '30' });
  });
});
