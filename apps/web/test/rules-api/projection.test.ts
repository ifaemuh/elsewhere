import { describe, expect, it } from 'vitest';
import { appOrigin, rulePageUrl, sanitizeMedium } from '@/lib/rules-api/links';
import { isPublic, toPublicRule, toRuleSummary } from '@/lib/rules-api/projection';
import { standardLibrary } from '../helpers/fixture-library';

const API = { source: 'api', medium: 'anonymous' } as const;

function rule(id: string) {
  const lib = standardLibrary();
  const found = lib.rules.find((r) => r.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return { lib, rule: found };
}

describe('rulePageUrl', () => {
  it('tags the rule page with source, medium, and campaign', () => {
    expect(rulePageUrl('test-cancelled-refund', { source: 'mcp', medium: 'ChatGPT' })).toBe(
      'https://elsewhere.test/rules/test-cancelled-refund?utm_source=mcp&utm_medium=chatgpt&utm_campaign=rules',
    );
  });

  it('sanitizes the medium', () => {
    expect(sanitizeMedium('Claude Desktop/1.2 (mac)')).toBe('claude-desktop-1.2-mac');
    expect(sanitizeMedium('')).toBe('unknown');
    expect(sanitizeMedium(null)).toBe('unknown');
    expect(sanitizeMedium('x'.repeat(80))).toHaveLength(40);
  });
});

describe('links edge cases', () => {
  it('trims a dash left dangling by the 40-char cut', () => {
    expect(sanitizeMedium(`${'a'.repeat(39)}-bbb`)).toBe('a'.repeat(39));
  });

  it('falls back to localhost when the app URL is empty', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = '';
    try {
      expect(appOrigin()).toBe('http://localhost:3000');
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  });
});

describe('toPublicRule', () => {
  it('projects a verified rule with citations and no internal fields', () => {
    const { lib, rule: r } = rule('test-cancelled-refund');
    const pub = toPublicRule(r, lib, API);
    expect(pub).toMatchObject({
      id: 'test-cancelled-refund',
      status: 'verified',
      how_to_claim: { steps: ['Ask for a refund in writing.'] },
      citations: [{ url: 'https://example.test/source', kind: 'regulation', quote: 'a refund is owed' }],
      page_url: 'https://elsewhere.test/rules/test-cancelled-refund?utm_source=api&utm_medium=anonymous&utm_campaign=rules',
    });
    expect(pub).not.toHaveProperty('notice');
    expect(pub).not.toHaveProperty('lead_character');
    expect(pub).not.toHaveProperty('verified_by');
    expect(pub).not.toHaveProperty('sources');
    expect(pub).not.toHaveProperty('applies_when');
    expect(pub.how_to_claim).not.toHaveProperty('templates');
  });

  it('adds a notice to a needs_review rule using the date it changed', () => {
    const { lib, rule: r } = rule('test-tarmac-delay');
    expect(toPublicRule(r, lib, API).notice).toBe('Being re-checked since 2026-10-05 after a source change.');
  });

  it('adds replaced_by to a retired rule', () => {
    const { lib, rule: r } = rule('test-old-voucher-rule');
    expect(toPublicRule(r, lib, API)).toMatchObject({ status: 'retired', replaced_by: 'test-cancelled-refund' });
  });

  it('refuses to project a draft', () => {
    const { lib, rule: r } = rule('test-draft-rule');
    expect(isPublic(r)).toBe(false);
    expect(() => toPublicRule(r, lib, API)).toThrow(/draft/);
  });
});

describe('toRuleSummary', () => {
  it('keeps only the summary fields', () => {
    const { lib, rule: r } = rule('test-tarmac-delay');
    expect(Object.keys(toRuleSummary(r, lib, API)).sort()).toEqual(
      ['domain', 'id', 'jurisdiction', 'notice', 'page_url', 'status', 'summary', 'title'].sort(),
    );
  });
});
