import { describe, expect, it } from 'vitest';
import { RECHECK_TEXT, shownOwed } from '@/lib/assist/owed';

describe('shownOwed', () => {
  const verified = new Set(['rule-a']);
  const isVerified = (id: string) => verified.has(id);

  it('keeps an owed item that still cites a verified rule', () => {
    expect(shownOwed([{ text: 'Up to €600.', rule_ids: ['rule-a', 'rule-b'] }], isVerified)).toEqual([{ text: 'Up to €600.', rule_ids: ['rule-a', 'rule-b'], rechecking: false }]);
  });

  it('replaces an item whose rules are all no longer verified, with no amount', () => {
    const [item] = shownOwed([{ text: 'Up to €600.', rule_ids: ['rule-b', 'rule-gone'] }], isVerified);
    expect(item).toEqual({ text: RECHECK_TEXT, rule_ids: [], rechecking: true });
    expect(JSON.stringify(item)).not.toMatch(/600|€/);
  });
});
