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

describe('resolveRulePage gone cases', () => {
  const retired = findRule(library, 'fixture-old-refund-rule')!;
  const withRules = (...rules: typeof library.rules): RulesLibrary => ({ ...library, rules: [...library.rules, ...rules] });

  it('is gone for a retired rule with no replaced_by', () => {
    const { replaced_by: _omit, ...rest } = retired;
    const lib = withRules({ ...rest, id: 'retired-orphan' });
    expect(resolveRulePage(lib, 'retired-orphan')).toEqual({ kind: 'gone' });
  });

  it('is gone when replaced_by points at a draft', () => {
    const lib = withRules({ ...retired, id: 'retired-to-draft', replaced_by: 'fixture-draft-rule' });
    expect(resolveRulePage(lib, 'retired-to-draft')).toEqual({ kind: 'gone' });
  });

  it('is gone when replaced_by points at another retired rule', () => {
    const lib = withRules({ ...retired, id: 'retired-to-retired', replaced_by: 'fixture-old-refund-rule' });
    expect(resolveRulePage(lib, 'retired-to-retired')).toEqual({ kind: 'gone' });
  });
});

describe('needsReviewSince history runs', () => {
  const base = findRule(library, 'fixture-tarmac-delay')!;
  const h = (status: string, date: string) => ({ version: 1, status, date }) as (typeof base.history)[number];

  it('returns the start of the latest needs_review run', () => {
    const rule = {
      ...base,
      history: [h('draft', '2026-10-01'), h('needs_review', '2026-10-02'), h('verified', '2026-10-03'), h('needs_review', '2026-10-10'), h('needs_review', '2026-10-12')],
    };
    expect(needsReviewSince(rule)).toBe('2026-10-10');
  });

  it('returns null when the latest history entry is not needs_review', () => {
    const rule = { ...base, history: [h('needs_review', '2026-10-02'), h('verified', '2026-10-03')] };
    expect(needsReviewSince(rule)).toBeNull();
  });
});

describe('accessors do not mutate the library', () => {
  it('leaves the library deep-equal after every accessor runs', () => {
    const lib = structuredClone(library);
    const before = structuredClone(lib);
    publishedRules(lib);
    staticRuleIds(lib);
    for (const rule of lib.rules) {
      resolveRulePage(lib, rule.id);
      needsReviewSince(rule);
      sourcesFor(lib, rule);
      entitlementLines(rule);
    }
    verifiedRulesIn(lib, 'flights');
    expect(lib).toEqual(before);
  });
});
