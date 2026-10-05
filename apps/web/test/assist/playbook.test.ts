import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { generatePlaybook } from '@/lib/assist/playbook';
import { mockModel } from '../helpers/mock-model';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const refund = rules.find((r) => r.id === 'fixture-us-refund-cancelled-flight')!;
const tarmac = rules.find((r) => r.id === 'fixture-tarmac-delay')!;

const input = {
  eventSummary: 'TP 204 from EWR on Nov 3 was cancelled.',
  situation: { 'event.type': 'cancellation' as const },
  applying: [refund],
  reviewing: [tarmac],
  extraNumbers: [],
};

const good = {
  summary: 'Your TP 204 flight was cancelled. You can take a cash refund instead of a voucher.',
  owed: [{ text: 'A refund to your original payment method, within 7 business days for card purchases.', rule_ids: [refund.id] }],
  steps: [{ text: 'Decline the voucher.', rule_ids: [refund.id] }],
  messages: [{ to: 'airline', channel: 'email', body: 'TP 204 on Nov 3 was cancelled. I decline the rebooking and request a refund to my original payment method.', rule_ids: [refund.id] }],
  caveats: ['“Stuck on the tarmac? There are time limits” is being re-checked, so we left it out.'],
};

describe('generatePlaybook', () => {
  it('returns a cited playbook that passes the check', async () => {
    const result = await generatePlaybook(input, { model: mockModel(good) });
    expect(result.citationCheckPassed).toBe(true);
    expect(result.model).not.toBe('template');
    expect(result.rulesCited).toEqual([{ rule_id: refund.id, rule_version: 1 }]);
  });

  it('retries once when the first draft invents an amount', async () => {
    const bad = { ...good, owed: [{ text: 'You are owed $500 cash.', rule_ids: [refund.id] }] };
    const model = mockModel(bad, good);
    const result = await generatePlaybook(input, { model });
    expect(result.playbook.owed[0].text).toContain('original payment method');
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[1].providerOptions).toEqual({ gateway: { disallowPromptTraining: true } });
  });

  it('falls back to the template after two failed drafts', async () => {
    const bad = { ...good, owed: [{ text: 'You are owed $500 cash.', rule_ids: [refund.id] }] };
    const result = await generatePlaybook(input, { model: mockModel(bad, bad) });
    expect(result.model).toBe('template');
    expect(result.playbook.owed).toEqual([{ text: refund.summary, rule_ids: [refund.id] }]);
    expect(result.playbook.caveats[0]).toContain('being re-checked');
  });

  it('uses the template when no verified rule applies', async () => {
    const result = await generatePlaybook({ ...input, applying: [] }, { model: mockModel(good) });
    expect(result.model).toBe('template');
    expect(result.playbook.owed).toEqual([]);
  });

  it('falls back to the template when the model call throws or its output does not parse', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('AI Gateway unavailable');
      },
    });
    for (const model of [down, mockModel({ not: 'a playbook' })]) {
      const result = await generatePlaybook(input, { model });
      expect(result.model).toBe('template');
      expect(result.citationCheckPassed).toBe(true);
      expect(result.playbook.owed).toEqual([{ text: refund.summary, rule_ids: [refund.id] }]);
    }
  });

  it('keeps the template within the copy rules', async () => {
    const { playbook } = await generatePlaybook(input, { model: mockModel({ not: 'a playbook' }) });
    const text = JSON.stringify(playbook);
    expect(playbook.caveats[0]).toContain('might apply — check');
    expect(text).not.toMatch(/we (filed|claimed|sued|will file)|on your behalf|you will (get|receive)/i);
  });
});
