import type { RulesLibrary } from '@elsewhere/rules/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { RuleArticle } from '@/components/rules/rule-article';
import { findRule, needsReviewSince, sourcesFor } from '@/lib/rules/accessors';

const library = fixture as unknown as RulesLibrary;

function render(id: string) {
  const rule = findRule(library, id)!;
  return renderToStaticMarkup(<RuleArticle rule={rule} sources={sourcesFor(library, rule)} reviewSince={needsReviewSince(rule)} />);
}

describe('RuleArticle', () => {
  it('shows the rule, steps, and quoted sources', () => {
    const html = render('fixture-us-refund-cancelled-flight');
    expect(html).toContain('Cancelled flight? You&#x27;re owed cash, not a voucher');
    expect(html).toContain('Ask for a refund to your original payment method, in writing.');
    expect(html).toContain('href="https://example.test/14-cfr-260"');
    expect(html).toContain('Fixture quote: a carrier must provide a prompt refund');
    expect(html).toContain('Not legal advice');
    expect(html).not.toContain('Being re-checked');
  });

  it('flags a rule under review with the date the re-check started', () => {
    expect(render('fixture-tarmac-delay')).toContain('Being re-checked since Oct 20, 2026');
  });
});
