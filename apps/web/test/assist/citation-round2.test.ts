import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { checkCitations } from '@/lib/assist/citation-check';
import { generatePlaybook } from '@/lib/assist/playbook';
import type { Playbook } from '@/lib/assist/playbook-schema';
import { templatePlaybook } from '@/lib/assist/template';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const byId = (id: string) => rules.find((r) => r.id === id)!;
const eu = byId('fixture-eu261-delay-compensation');
const card = byId('fixture-card-trip-delay');
const refund = byId('fixture-us-refund-cancelled-flight');
const tarmac = byId('fixture-tarmac-delay');

const empty: Playbook = { summary: 'Your flight was late.', owed: [], steps: [], messages: [], caveats: [] };
const owed = (text: string, rule = eu): Playbook => ({ ...empty, owed: [{ text, rule_ids: [rule.id] }] });
const msg = (body: string, ids: string[] = [refund.id]): Playbook => ({ ...empty, messages: [{ to: 'airline', channel: 'email', body, rule_ids: ids }] });
const kinds = (pb: Playbook, allowed: Rule[] = [eu], extras = ['200']) => checkCitations(pb, allowed, extras).map((i) => i.problem);

describe('1. legitimate templates pass', () => {
  it('a spelled-out duration that the rule text states is accepted; others are still flagged', () => {
    expect(kinds(owed('Landed three hours or more late.'))).toEqual([]);
    expect(kinds(owed('Paid within two weeks.'))).toContain('unparseable_quantity');
    expect(kinds(owed('Six hours or more.', card), [card])).toEqual([]);
    expect(kinds(owed('Seven hours or more.', card), [card])).toContain('unparseable_quantity');
  });

  const verified = rules.filter((r) => r.status === 'verified');
  it.each(verified.map((r) => [r.id, r] as const))('template for %s passes the check and the pipeline', async (_id, rule) => {
    const t = templatePlaybook({ eventSummary: 'TP 204 was cancelled.', applying: [rule], reviewing: [tarmac] });
    expect(checkCitations(t, [rule], [])).toEqual([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('down');
      },
    });
    const result = await generatePlaybook({ eventSummary: 'TP 204 was cancelled.', situation: {}, applying: [rule], reviewing: [tarmac], extraNumbers: [] }, { model: down });
    expect(result.model).toBe('template');
    expect(result.citationCheckPassed).toBe(true);
  });

  it('all verified rules together', () => {
    const t = templatePlaybook({ eventSummary: 'TP 204 was cancelled.', applying: verified, reviewing: [] });
    expect(checkCitations(t, verified, [])).toEqual([]);
  });
});

describe('2. money ranges and lists carry the currency', () => {
  it.each(['Up to €250–900 depending on distance.', 'Up to €250-900 depending on distance.', 'Up to €250, 400 or 900 depending on distance.', 'Up to EUR 250/400/900.', 'Up to 250–900 €.'])('flags the unsupported end of %s', (t) => {
    expect(kinds(owed(t))).toContain('number_not_in_rule');
  });
  it('accepts supported ends and hedges the whole range', () => {
    expect(kinds(owed('Up to €250–600 depending on distance.'))).toEqual([]);
    expect(kinds(owed('Up to €250, 400 or 600 depending on distance.'))).toEqual([]);
    expect(kinds(owed('You get €250–600.'))).toContain('tier_not_hedged');
  });
  it('does not swallow a following duration', () => {
    expect(kinds(owed('Up to €600, 7 days after a valid claim.'))).toEqual([]);
  });
});

describe('3. normalization', () => {
  it.each([
    ['non-breaking hyphen', 'You have a 30‑day window.'],
    ['en dash', 'You have a 30–day window.'],
    ['figure dash range', 'Wait 9‒3 hours.'],
    ['minus range', 'Wait 9−3 hours.'],
    ['double space after symbol', 'Up to €  900.'],
    ['zero-width after symbol', 'Up to €​900.'],
    ['zero-width in unit', 'Within 30​days.'],
    ['full-width digits', 'Up to €９００.'],
    ['full-width days', 'Within ３０ days.'],
    ['narrow nbsp', 'Up to 900 €.'],
  ])('%s', (_n, t) => {
    expect(kinds(owed(t))).toContain('number_not_in_rule');
  });
  it('curly apostrophes cannot hide a promise', () => {
    expect(kinds({ ...empty, summary: 'You’re owed a refund.' })).toContain('forbidden_phrase');
    expect(kinds({ ...empty, summary: 'You’ll get a refund.' })).toContain('forbidden_phrase');
  });
});

describe('4. multipliers and forbidden phrases', () => {
  it.each(['3x the fare.', 'Three times the fare.', '3 times the fare.', 'Quadruple the fare.'])('flags %s', (t) => {
    expect(kinds(owed(t))).toContain('unparseable_quantity');
  });
  const bad = ["You'll get a refund.", 'You will be fully refunded.', "You're all owed a refund.", 'Our agents submitted the form.', 'Our staff lodged a claim.', 'We lodged a claim.', 'Your claim has been filed.', 'The forms have been submitted.'];
  it.each(bad)('rejects %s in every non-message field', (t) => {
    expect(kinds({ ...empty, summary: t })).toContain('forbidden_phrase');
    expect(kinds({ ...empty, steps: [{ text: t, rule_ids: [] }] })).toContain('forbidden_phrase');
    expect(kinds({ ...empty, caveats: [t] })).toContain('forbidden_phrase');
  });
  it('still rejects the promises in messages, except owed and passive', () => {
    expect(kinds(msg("You'll get a refund."), [refund])).toContain('forbidden_phrase');
    expect(kinds(msg('Our agents submitted the form.'), [refund])).toContain('forbidden_phrase');
    expect(kinds(msg('Elsewhere filed it.'), [refund])).toContain('forbidden_phrase');
  });
});

describe('5. traveler-voice messages', () => {
  it.each(['We requested a refund on 3 May.', 'We were booked on TP 204.', 'We booked this trip in March.'])('%s passes in a message and fails in the summary', (t) => {
    expect(kinds(msg(t), [refund])).toEqual([]);
    expect(kinds({ ...empty, summary: t })).toContain('forbidden_phrase');
  });
});

describe('6. unit abbreviations', () => {
  it.each(['Paid within 2 wks.', 'Claim within 6 mos.', 'Claim within 30d.', 'Landed 3h20m late, claim within 90mins.', '50 per cent of the fare.'])('flags %s', (t) => {
    expect(kinds(owed(t))).toContain('number_not_in_rule');
  });
  it('3h20m is the incident delay when extras say 200', () => {
    expect(kinds(owed('Landed 3h20m late.'))).toEqual([]);
  });
});

describe('7. number formats', () => {
  it('1,000 is one thousand', () => {
    expect(kinds(owed('You have 1,000 days to claim.'))).toContain('number_not_in_rule');
  });
  it('a decimal comma is unparseable', () => {
    expect(kinds(owed('Wait 1,5 hours.'))).toContain('unparseable_quantity');
  });
});

describe('8. digit-less durations', () => {
  it.each(['Paid within a week.', 'You have a year to claim.', 'Paid within a fortnight.', 'Wait half an hour.', 'Wait an hour.'])('flags %s', (t) => {
    expect(kinds(owed(t))).toContain('unparseable_quantity');
  });
  it('accepts the phrase when a cited rule uses it', () => {
    const rule = { ...refund, id: 'synthetic-week', summary: 'It has to arrive within a week of the request.' } as Rule;
    expect(kinds(owed('It has to arrive within a week.', rule), [rule], [])).toEqual([]);
  });
});

describe('9. currencies', () => {
  it.each(['Up to A$900.', 'Up to NZ$900.', 'Up to 900 bucks.', 'Up to 500 dollars.', 'Up to £250.'])('flags %s', (t) => {
    expect(kinds(owed(t))).toContain('number_not_in_rule');
  });
});

describe('10. the "up to" window', () => {
  it('stops at sentence punctuation and ignores "up to date" and "up to you"', () => {
    expect(kinds(owed('Keep receipts up to date. You get €600.'))).toContain('tier_not_hedged');
    expect(kinds(owed('It is up to you. €600 each.'))).toContain('tier_not_hedged');
    expect(kinds(owed('Up to: €600.'))).toContain('tier_not_hedged');
  });
  it('a hedge covers only the first amount after it', () => {
    expect(kinds(owed('Up to €600: a flat €600.'))).toContain('tier_not_hedged');
    expect(kinds(owed('Up to €600 or €400.'))).toContain('tier_not_hedged');
    expect(kinds(owed('Up to €600 or up to €400.'))).toEqual([]);
    expect(kinds(owed('Up to a fixed sum of only €600.'))).toContain('tier_not_hedged');
  });
});

describe('11. capped amounts', () => {
  it('a max_ amount needs "up to" even when it is the only value', () => {
    expect(kinds(owed('Your card pays $500 per ticket.', card), [card])).toContain('tier_not_hedged');
    expect(kinds(owed('Your card pays up to $500 per ticket.', card), [card])).toEqual([]);
  });
});
