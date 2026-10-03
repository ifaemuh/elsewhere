import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { checkCitations } from '@/lib/assist/citation-check';
import type { Playbook } from '@/lib/assist/playbook-schema';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const eu = rules.find((r) => r.id === 'fixture-eu261-delay-compensation')!;
const refund = rules.find((r) => r.id === 'fixture-us-refund-cancelled-flight')!;
const card = rules.find((r) => r.id === 'fixture-card-trip-delay')!;
const tarmac = rules.find((r) => r.id === 'fixture-tarmac-delay')!;

const empty: Playbook = { summary: 'Your flight was late.', owed: [], steps: [], messages: [], caveats: [] };
const owed = (text: string, ids = [eu.id]): Playbook => ({ ...empty, owed: [{ text, rule_ids: ids }] });
const message = (body: string, ids: string[] = [eu.id]): Playbook => ({ ...empty, messages: [{ to: 'airline', channel: 'email', body, rule_ids: ids }] });
const problems = (pb: Playbook, allowed: Rule[] = [eu], extras: string[] = ['200']) => checkCitations(pb, allowed, extras).map((i) => i.problem);

describe('bypass table: every row is rejected or flagged against the EU rule', () => {
  const rejected: [string, string][] = [
    ['currency code before', 'Up to EUR 900.'],
    ['USD code', 'Up to USD 500.'],
    ['CHF code', 'Up to CHF 400.'],
    ['suffix symbol', 'Up to 900€.'],
    ['hyphenated duration 30', 'You have a 30-day window to claim.'],
    ['hyphenated duration 14', 'You have a 14-day window to claim.'],
    ['calendar days', 'Paid within 30 calendar days.'],
    ['working days', 'Paid within 14 working days.'],
    ['years', 'You have 2 years to claim.'],
    ['nights', 'Covers 2 nights.'],
    ['abbreviated hours', 'Wait 72 h.'],
    ['percent', 'You get 50% extra.'],
    ['currency-blind', 'You may be entitled to up to $600.'],
    ['unit-blind', 'Paid within 7 months.'],
    ['number from the rule name', 'Up to €261.'],
    ['range with an unsupported end', 'Wait 2–3 hours.'],
    ['range with an unsupported end (hyphen)', 'Wait 4-5 hours.'],
  ];
  it.each(rejected)('%s', (_name, text) => {
    expect(problems(owed(text))).toContain('number_not_in_rule');
    expect(problems(message(text))).toContain('number_not_in_rule');
  });

  const unparseable: [string, string][] = [
    ['two weeks', 'Paid within two weeks.'],
    ['seven days', 'Paid within seven days.'],
    ['six hundred euros', 'You may be owed six hundred euros.'],
    ['double', 'Double the fare.'],
    ['twice', 'Twice the amount.'],
    ['triple', 'Triple compensation.'],
  ];
  it.each(unparseable)('%s is flagged as unparseable', (_name, text) => {
    expect(problems(owed(text))).toContain('unparseable_quantity');
  });

  it('flags an unhedged tier amount', () => {
    expect(problems(owed('You may be entitled to 600 €.'))).toEqual(['tier_not_hedged']);
    expect(problems(owed('You may be entitled to €600.'))).toEqual(['tier_not_hedged']);
  });

  it('rejects unsupported claims in summary, steps and caveats', () => {
    const pb: Playbook = {
      summary: 'Elsewhere has filed your claim. You will get €5,000.',
      owed: [],
      steps: [{ text: 'Demand $9,000 within 90 days.', rule_ids: [] }],
      messages: [],
      caveats: ['The tarmac rule means you are owed $1,000.'],
    };
    const issues = checkCitations(pb, [eu], ['200']);
    expect(issues.filter((i) => i.path === 'summary').map((i) => i.problem)).toEqual(expect.arrayContaining(['number_not_in_rule', 'forbidden_phrase']));
    expect(issues.filter((i) => i.path === 'steps[0]').map((i) => i.problem)).toEqual(expect.arrayContaining(['missing_rule_id', 'number_not_in_rule']));
    expect(issues.filter((i) => i.path === 'caveats[0]').map((i) => i.problem)).toEqual(expect.arrayContaining(['number_not_in_rule', 'forbidden_phrase']));
  });
});

describe('still passes', () => {
  it('up to €600 on the EU rule, and hedged tiers generally', () => {
    expect(problems(owed('You may be entitled to up to €600.'))).toEqual([]);
    expect(problems(owed('Up to €250, or up to €400, or up to €600 by distance, paid within 7 days of a valid claim.'))).toEqual([]);
    expect(problems(owed('Up to EUR 400.'))).toEqual([]);
  });

  it('the incident delay as a compound duration, and its whole hours', () => {
    expect(problems(message('Flight A3 349 arrived 3 hours 20 minutes late.'))).toEqual([]);
    expect(problems(message('Flight A3 349 arrived 3 h 20 min late.'))).toEqual([]);
    expect(problems(owed('Landed 200 minutes late.', [refund.id]), [refund])).toEqual([]);
    expect(problems(owed('Landed 3 hours late.', [refund.id]), [refund])).toEqual([]);
  });

  it('a duration the rule states, spelled out in the rule text', () => {
    expect(problems(owed('Three hours or more late.'))).toContain('unparseable_quantity');
    expect(problems(owed('Landed 3 hours late.'), [eu], [])).toEqual([]);
  });

  it('flight numbers, dates and codes are not quantities', () => {
    expect(problems(message('A3 349 on Nov 5, booking ref 4K2L9, EU261, gate 4 at 14:30.'))).toEqual([]);
  });

  it('a logistics-only message needs no rule id', () => {
    const pb: Playbook = { ...empty, messages: [{ to: 'group', channel: 'chat', body: 'Flight is cancelled, meet at gate 4.', rule_ids: [] }] };
    expect(problems(pb)).toEqual([]);
  });
});

describe('typed quantities', () => {
  it('extra incident minutes never allow money or percents', () => {
    expect(problems(owed('Up to €200.'), [eu], ['200'])).toContain('number_not_in_rule');
    expect(problems(owed('You get 200%.'), [eu], ['200'])).toContain('number_not_in_rule');
  });

  it('a bare number in rule text allows nothing', () => {
    expect(problems(owed('Up to €261.'))).toContain('number_not_in_rule');
    expect(problems(owed('Paid within 261 days.'))).toContain('number_not_in_rule');
  });

  it('money amounts need the rule to state that currency', () => {
    expect(problems(owed('A full refund plus $200.', [refund.id]), [refund])).toContain('number_not_in_rule');
    expect(problems(owed('A full refund plus €250.', [refund.id]), [refund])).toContain('number_not_in_rule');
    expect(problems(owed('Up to $500 per ticket.', [card.id]), [card])).toEqual([]);
  });

  it('a duration unit must match the rule', () => {
    expect(problems(owed('Within 7 business days for card purchases.', [refund.id]), [refund])).toEqual([]);
    expect(problems(owed('Within 7 days.', [refund.id]), [refund])).toContain('number_not_in_rule');
  });

  it('thousands separators and decimals are normalized', () => {
    expect(problems(owed('Up to $500.00 per ticket.', [card.id]), [card])).toEqual([]);
    expect(problems(owed('Up to $1,500.00.', [card.id]), [card])).toContain('number_not_in_rule');
  });

  it('flags citations outside the matched set, including a rule under recheck', () => {
    expect(problems(owed('Food and water after 3 hours.', [tarmac.id]))).toContain('rule_not_allowed');
  });
});

describe('forbidden phrases', () => {
  const bad = [
    'Elsewhere has filed your claim.',
    'We submitted the form for you.',
    'Our team requested a refund.',
    'We booked you a hotel.',
    'We filed it today.',
    'We sued the airline.',
    'We claimed it for you.',
    'We handled it on your behalf.',
    'Compensation is guaranteed.',
    'We guarantee a refund.',
    'You will get a refund.',
    'You will receive the money.',
    'You will be refunded in full.',
    'You will be paid.',
  ];
  it.each(bad)('rejects %s in summary, steps and caveats', (text) => {
    expect(problems({ ...empty, summary: text })).toContain('forbidden_phrase');
    expect(problems({ ...empty, steps: [{ text, rule_ids: [] }] })).toContain('forbidden_phrase');
    expect(problems({ ...empty, caveats: [text] })).toContain('forbidden_phrase');
    expect(problems(message(text))).toContain('forbidden_phrase');
  });

  it('rejects "you are owed" outside messages but allows first-person drafts', () => {
    expect(problems({ ...empty, summary: "You're owed a refund." })).toContain('forbidden_phrase');
    expect(problems(owed('You are owed a refund.'))).toContain('forbidden_phrase');
    expect(problems({ ...empty, steps: [{ text: 'You are owed it.', rule_ids: [] }] })).toContain('forbidden_phrase');
    expect(problems(message('I believe I am entitled to compensation. You are owed a reply.'))).toEqual([]);
  });

  it('allows the framing we want', () => {
    const pb: Playbook = { ...empty, summary: 'We drafted this for you to review and send yourself.', owed: [{ text: 'You may be entitled to up to €600.', rule_ids: [eu.id] }] };
    expect(problems(pb)).toEqual([]);
  });
});

describe('field rules', () => {
  it('a step with a quantity needs rule ids; one without does not', () => {
    expect(problems({ ...empty, steps: [{ text: 'Write to the airline today.', rule_ids: [] }] })).toEqual([]);
    expect(problems({ ...empty, steps: [{ text: 'Write within 7 days.', rule_ids: [] }] })).toContain('missing_rule_id');
    expect(problems({ ...empty, steps: [{ text: 'Write within 7 days.', rule_ids: [eu.id] }] })).toEqual([]);
  });

  it('a message with a quantity needs rule ids', () => {
    expect(problems(message('Pay within 7 days.', []))).toContain('missing_rule_id');
  });

  it('owed and messages are checked against their own cited rules', () => {
    expect(problems(owed('Within 7 days.', [refund.id]), [eu, refund])).toContain('number_not_in_rule');
  });
});
