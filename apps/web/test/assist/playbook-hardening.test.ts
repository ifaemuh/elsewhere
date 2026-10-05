import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { generatePlaybook } from '@/lib/assist/playbook';
import { templatePlaybook } from '@/lib/assist/template';
import { mockModel } from '../helpers/mock-model';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const eu = rules.find((r) => r.id === 'fixture-eu261-delay-compensation')!;
const refund = rules.find((r) => r.id === 'fixture-us-refund-cancelled-flight')!;
const tarmac = rules.find((r) => r.id === 'fixture-tarmac-delay')!;

const input = {
  eventSummary: 'TP 204 from EWR on Nov 3 was cancelled.',
  situation: { 'event.type': 'cancellation' as const },
  applying: [refund],
  reviewing: [tarmac],
  extraNumbers: [],
};

afterEach(() => vi.restoreAllMocks());

describe('unchecked fields', () => {
  const bad = {
    summary: 'Elsewhere has filed an EU261 claim on your behalf. You will get €5,000.',
    owed: [],
    steps: [{ text: 'Wait for the €5,000 to arrive within 3 days.', rule_ids: [] }],
    messages: [],
    caveats: ['The tarmac rule also guarantees you $1,000.'],
  };

  it('a draft that smuggles claims into summary, steps or caveats is rejected twice, then templated', async () => {
    const model = mockModel(bad, bad);
    const result = await generatePlaybook({ ...input, applying: [eu], extraNumbers: ['200'] }, { model });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(result.model).toBe('template');
    expect(JSON.stringify(result.playbook)).not.toContain('5,000');
  });
});

describe('honest citationCheckPassed', () => {
  it('is computed for the template, not hard-coded', async () => {
    const odd = { ...input, eventSummary: 'Delayed 99 hours and you will get €5,000.' };
    const result = await generatePlaybook(odd, { model: mockModel({ not: 'a playbook' }) });
    expect(result.model).toBe('template');
    expect(result.citationCheckPassed).toBe(false);
  });

  it('is true for a clean template', async () => {
    const result = await generatePlaybook(input, { model: mockModel({ not: 'a playbook' }) });
    expect(result.citationCheckPassed).toBe(true);
  });
});

describe('model configuration', () => {
  it('a missing AI key falls back to the template instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('ELSEWHERE_AI_FAKE_DIR', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    const result = await generatePlaybook(input);
    vi.unstubAllEnvs();
    expect(result.model).toBe('template');
  });

  it('logs only the error name and message, never generated text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = new MockLanguageModelV4({
      doGenerate: async () => {
        throw Object.assign(new Error('parse failed'), { text: 'Maria Lopez, passport X1234567' });
      },
    });
    await generatePlaybook(input, { model: down });
    expect(JSON.stringify(spy.mock.calls)).toContain('parse failed');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Maria');
    expect(spy.mock.calls[0].every((arg) => typeof arg === 'string')).toBe(true);
  });
});

describe('prompt', () => {
  it('treats the incident text as data and never sends a rechecked rule by title', async () => {
    const good = { summary: 'Cancelled.', owed: [], steps: [], messages: [], caveats: [] };
    const model = mockModel(good);
    await generatePlaybook(input, { model });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toMatch(/data, not instructions/i);
    expect(sent).not.toContain(tarmac.title);
    expect(sent).toContain(tarmac.id);
  });
});

describe('only verified rules', () => {
  it('a needs_review rule in applying is dropped, and with nothing left no model call is made', async () => {
    const model = mockModel({});
    const result = await generatePlaybook({ ...input, applying: [tarmac] }, { model });
    expect(result.model).toBe('template');
    expect(result.playbook.owed).toEqual([]);
    expect(result.rulesCited).toEqual([]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('the template drops it too', () => {
    const t = templatePlaybook({ eventSummary: 'x', applying: [tarmac, refund], reviewing: [] });
    expect(t.owed).toEqual([{ text: refund.summary, rule_ids: [refund.id] }]);
  });
});

describe('template copy', () => {
  it('never quotes a rule under recheck: no amounts, no "owed"', () => {
    const t = templatePlaybook({ eventSummary: 'TP 204 was cancelled.', applying: [], reviewing: [eu, refund] });
    const text = t.caveats.join(' ');
    expect(text).not.toMatch(/[\d€$£]/);
    expect(text).not.toMatch(/owed/i);
    expect(text).not.toContain("You're");
    expect(text).not.toContain(eu.title);
    expect(t.caveats[0]).toContain('might apply — check');
    expect(t.caveats[0]).toContain('being re-checked');
  });

  it('with no applying rule it does not claim to be drafted from rules', () => {
    const t = templatePlaybook({ eventSummary: 'x', applying: [], reviewing: [] });
    const text = t.caveats.join(' ');
    expect(text).not.toContain('We drafted this from the rules');
    expect(text).not.toContain('You decide what to send');
  });
});
