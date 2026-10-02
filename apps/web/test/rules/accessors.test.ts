import type { RulesLibrary } from '@elsewhere/rules';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import {
  findRule,
  needsReviewSince,
  publishedRules,
  resolveRulePage,
  sourcesFor,
  staticRuleIds,
  verifiedRulesIn,
} from '@/lib/rules/accessors';
import { entitlementLines, formatIsoDate } from '@/lib/rules/present';

const library = fixture as unknown as RulesLibrary;

describe('publishedRules', () => {
  it('shows verified and needs_review rules, ordered by domain then title', () => {
    expect(publishedRules(library).map((r) => r.id)).toEqual([
      'fixture-us-refund-cancelled-flight',
      'fixture-eu261-delay-compensation',
      'fixture-tarmac-delay',
      'fixture-us-real-id',
      'fixture-passport-validity-pt',
      'fixture-card-trip-delay',
    ]);
  });

  it('prerenders every rule except drafts', () => {
    expect(staticRuleIds(library)).not.toContain('fixture-draft-rule');
    expect(staticRuleIds(library)).toContain('fixture-old-refund-rule');
  });
});

describe('resolveRulePage', () => {
  it('treats drafts and unknown ids the same', () => {
    expect(resolveRulePage(library, 'fixture-draft-rule')).toEqual({ kind: 'missing' });
    expect(resolveRulePage(library, 'nope')).toEqual({ kind: 'missing' });
  });

  it('redirects a retired rule to its published replacement', () => {
    expect(resolveRulePage(library, 'fixture-old-refund-rule')).toEqual({ kind: 'redirect', to: '/rules/fixture-us-refund-cancelled-flight' });
  });

  it('serves needs_review rules', () => {
    expect(resolveRulePage(library, 'fixture-tarmac-delay').kind).toBe('page');
  });
});

describe('needsReviewSince', () => {
  it('returns the start of the current needs_review run', () => {
    expect(needsReviewSince(findRule(library, 'fixture-tarmac-delay')!)).toBe('2026-10-20');
    expect(needsReviewSince(findRule(library, 'fixture-us-real-id')!)).toBeNull();
  });
});

describe('sourcesFor and verifiedRulesIn', () => {
  it('resolves source URLs from the library', () => {
    const [entry] = sourcesFor(library, findRule(library, 'fixture-us-refund-cancelled-flight')!);
    expect(entry.source?.url).toBe('https://example.test/14-cfr-260');
  });

  it('filters verified rules by domain', () => {
    expect(verifiedRulesIn(library, 'money').map((r) => r.id)).toEqual(['fixture-card-trip-delay']);
  });
});

describe('present', () => {
  it('formats entitlement amounts and dates for people', () => {
    expect(entitlementLines(findRule(library, 'fixture-card-trip-delay')!)).toEqual(['Max usd per ticket: 500', 'Min delay hours: 6']);
    expect(formatIsoDate('2026-10-20')).toBe('Oct 20, 2026');
  });
});
