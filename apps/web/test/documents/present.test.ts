import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { NO_COVERAGE_DETAIL, PASSPORT_GAP_DETAIL } from '@/lib/documents/check';
import { affiliateOffer, groupStatus, renewalSentenceFor } from '@/lib/documents/present';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const passportRule = rules.find((r) => r.id === 'fixture-passport-validity-pt')!;
const route = {
  official_label: 'Renew online',
  official_url: 'https://travel.state.gov/x',
  official_note: null,
  routine_processing_days: 56,
  expedited_processing_days: 21,
  affiliate_label: null,
  affiliate_url: null,
  affiliate_disclosure: null,
};
const trip = { start_date: '2026-11-03', end_date: '2026-11-10', destination_country: 'PT' };
const passport = { expires_on: '2027-01-15' };

describe('groupStatus', () => {
  it('never reports All clear for a member with no check rows', () => {
    expect(groupStatus([])).toBe('Not checked yet');
  });
  it('ranks needs-attention above unknown above all clear', () => {
    expect(groupStatus([{ result: 'unknown', rule_id: 'a', detail: '' }, { result: 'action_needed', rule_id: 'b', detail: '' }])).toBe('Needs attention');
    expect(groupStatus([{ result: 'unknown', rule_id: 'a', detail: '' }])).toBe('Hasn’t confirmed yet');
    expect(groupStatus([{ result: 'ok', rule_id: null, detail: '' }])).toBe('All clear');
  });
  it('shows a neutral state when no verified rule covers the trip', () => {
    expect(groupStatus([{ result: 'unknown', rule_id: null, detail: NO_COVERAGE_DETAIL }])).toBe('No verified rules for this trip yet');
  });
  it('says the passport is not covered for a gap row', () => {
    expect(groupStatus([{ result: 'unknown', rule_id: null, detail: PASSPORT_GAP_DETAIL }])).toBe('Passport not covered yet');
  });
  it('still ranks needs-attention above a gap row', () => {
    expect(groupStatus([{ result: 'unknown', rule_id: null, detail: PASSPORT_GAP_DETAIL }, { result: 'action_needed', rule_id: 'b', detail: '' }])).toBe('Needs attention');
  });
});

describe('renewalSentenceFor', () => {
  const base = { rule: passportRule, passport, trip, route, today: new Date('2026-08-01T12:00:00Z') };
  it('builds the date sentence only for a failing check', () => {
    expect(renewalSentenceFor({ ...base, check: { result: 'action_needed', detail: 'Passport' } })).toMatch(/^Your passport expires 2 months after the trip; Portugal needs 3\./);
  });
  it('shows no renewal sentence on an unknown check, even with a valid passport', () => {
    expect(renewalSentenceFor({ ...base, check: { result: 'unknown', detail: 'Hasn’t confirmed the details for: Passport' } })).toBeNull();
  });
});

describe('affiliateOffer', () => {
  it('needs the url, label and disclosure together (FTC)', () => {
    expect(affiliateOffer(route)).toBeNull();
    expect(affiliateOffer({ ...route, affiliate_url: 'https://a.test', affiliate_label: 'Rush it', affiliate_disclosure: null })).toBeNull();
    expect(affiliateOffer({ ...route, affiliate_url: 'https://a.test', affiliate_label: null, affiliate_disclosure: 'We earn a fee' })).toBeNull();
    expect(affiliateOffer({ ...route, affiliate_url: 'https://a.test', affiliate_label: 'Rush it', affiliate_disclosure: 'We earn a fee' })).toEqual({
      url: 'https://a.test',
      label: 'Rush it',
      disclosure: 'We earn a fee',
    });
  });
});

it('exports the stored no-coverage detail', () => {
  expect(NO_COVERAGE_DETAIL).toMatch(/verified/);
});
