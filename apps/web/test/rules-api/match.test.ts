import { describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { fakeDb } from '../helpers/supabase-fake';
import { POST } from '@/app/api/rules/match/route';
import { parseSituation } from '@/lib/rules-api/situation';
import { setLibrary } from '../helpers/library-holder';
import { fixtureRule, goldenCases, makeLibrary, standardLibrary } from '../helpers/fixture-library';

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('https://elsewhere.test/api/rules/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const sorted = (xs: string[]) => [...xs].sort();

describe('parseSituation', () => {
  it('accepts known facts with valid values', () => {
    expect(parseSituation({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true } })).toEqual({
      ok: true,
      situation: { 'event.type': 'cancellation', 'flight.touches_us': true },
    });
  });

  it('collects every unknown or ill-typed fact', () => {
    const result = parseSituation({ facts: { 'event.kind': 'x', 'flight.touches_us': 'yes', 'event.type': 'meteor' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(sorted(result.errors.map((e) => e.fact))).toEqual(['event.kind', 'event.type', 'flight.touches_us']);
  });

  it('rejects a body without facts or with no facts', () => {
    expect(parseSituation({}).ok).toBe(false);
    expect(parseSituation({ facts: {} }).ok).toBe(false);
  });
});

describe('POST /api/rules/match', () => {
  it('splits rules into applies and may_apply with missing facts', async () => {
    setLibrary(standardLibrary());
    const full = await (await post({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true, 'passenger.accepted_alternative': false } })).json();
    expect(full.data.applies.map((r: { id: string }) => r.id)).toEqual(['test-cancelled-refund']);
    expect(full.data.applies[0].citations.length).toBeGreaterThan(0);

    const partial = await (await post({ facts: { 'event.type': 'cancellation' } })).json();
    expect(partial.data.applies).toEqual([]);
    expect(partial.data.may_apply[0].id).toBe('test-cancelled-refund');
    expect(sorted(partial.data.may_apply[0].missing_facts)).toEqual(['flight.touches_us', 'passenger.accepted_alternative']);
  });

  it('never matches drafts or retired rules, even with identical conditions', async () => {
    setLibrary(standardLibrary());
    const body = await (await post({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true, 'passenger.accepted_alternative': false } })).json();
    const all = [...body.data.applies, ...body.data.may_apply].map((r: { id: string }) => r.id);
    expect(all).not.toContain('test-draft-rule');
    expect(all).not.toContain('test-old-voucher-rule');
    expect(body.data.does_not_apply_count).toBe(1);
  });

  it('is never cached', async () => {
    setLibrary(standardLibrary());
    const res = await post({ facts: { 'event.type': 'delay' } });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 400 for invalid JSON and for invalid facts, pointing to the vocabulary', async () => {
    setLibrary(standardLibrary());
    expect((await post('{nope')).status).toBe(400);
    const res = await post({ facts: { 'event.kind': 'x' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_facts');
    expect(body.error.message).toContain('/api/rules/facts');
    expect(body.error.details.errors[0].fact).toBe('event.kind');
  });
});

describe('POST /api/rules/match hardening', () => {
  it('rejects oversized bodies with 413 before parsing', async () => {
    setLibrary(standardLibrary());
    const res = await post(JSON.stringify({ facts: { 'event.type': 'x'.repeat(40_000) } }));
    expect(res.status).toBe(413);
  });

  it('rejects non-JSON content types and non-object facts', async () => {
    setLibrary(standardLibrary());
    const res = await POST(
      new Request('https://elsewhere.test/api/rules/match', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
    );
    expect(res.status).toBe(415);
    for (const facts of [[], 'event.type', 5, null]) {
      expect((await post({ facts })).status).toBe(400);
    }
    expect((await post('[1]')).status).toBe(400);
  });

  it('treats prototype keys as unknown facts and never pollutes', async () => {
    setLibrary(standardLibrary());
    const res = await post('{"facts":{"__proto__":{"polluted":true},"constructor":"x","toString":true,"event.type":"delay"}}');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details.errors.map((e: { fact: string }) => e.fact).sort()).toEqual(['__proto__', 'constructor', 'toString']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseSituation(JSON.parse('{"facts":{"__proto__":"x"}}')).ok).toBe(false);
  });

  it('does not echo huge values or names in error messages', async () => {
    setLibrary(standardLibrary());
    const res = await post({ facts: { 'event.type': 'z'.repeat(5000), ['n'.repeat(5000)]: 1 } });
    expect(res.status).toBe(400);
    expect((await res.text()).length).toBeLessThan(2000);
  });

  it('returns needs_review matches with their notice', async () => {
    setLibrary(standardLibrary());
    const body = await (await post({ facts: { 'event.type': 'tarmac_delay', 'flight.is_domestic_us': true } })).json();
    expect(body.data.applies.map((r: { id: string }) => r.id)).toEqual(['test-tarmac-delay']);
    expect(body.data.applies[0].notice).toMatch(/Being re-checked/);
  });

  it('stores fact names and event_type only, never values', async () => {
    setLibrary(standardLibrary());
    await post({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true, 'bogus.fact': 'secret-value' } });
    await post({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true } });
    const calls = vi.mocked(after).mock.calls.slice(-2);
    for (const c of calls) await (c[0] as () => Promise<void>)();
    expect(fakeDb.events[0].fact_names).toEqual(['event.type', 'flight.touches_us']);
    expect(fakeDb.events[1]).toMatchObject({ endpoint: 'match', event_type: 'cancellation', status: 200 });
    expect(JSON.stringify(fakeDb.events)).not.toContain('secret-value');
  });
});

describe('golden match fixtures through POST /api/rules/match', () => {
  const cases = goldenCases();

  it('has fixtures to run', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const golden of cases) {
    it(`${golden.file}: ${golden.name}`, async () => {
      const rules = golden.rules.map(fixtureRule);
      setLibrary(makeLibrary(rules));
      const res = await post({ facts: golden.situation });
      expect(res.status).toBe(200);
      const { data } = await res.json();

      // Track A's expectations use matchRules' default statuses (verified only).
      const verified = new Set(rules.filter((r) => r.status === 'verified').map((r) => r.id));
      const appliesIds: string[] = data.applies.map((r: { id: string }) => r.id).filter((id: string) => verified.has(id));
      const mayApply = data.may_apply
        .filter((r: { id: string }) => verified.has(r.id))
        .map((r: { id: string; missing_facts: string[] }) => `${r.id}:${sorted(r.missing_facts).join(',')}`);

      expect(sorted(appliesIds)).toEqual(sorted(golden.expect.filter((e) => e.outcome === 'applies').map((e) => e.rule_id)));
      expect(sorted(mayApply)).toEqual(
        sorted(golden.expect.filter((e) => e.outcome === 'may_apply').map((e) => `${e.rule_id}:${sorted(e.missing_facts).join(',')}`)),
      );
      for (const e of golden.expect.filter((x) => x.outcome === 'does_not_apply')) {
        expect([...appliesIds, ...mayApply.map((m: string) => m.split(':')[0])]).not.toContain(e.rule_id);
      }
    });
  }
});