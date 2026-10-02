import { describe, expect, it } from 'vitest';
import { GET as search } from '@/app/api/rules/route';
import { GET as changes } from '@/app/api/rules/changes/route';
import { searchRules, tokenize } from '@/lib/rules-api/search';
import { publicChanges, publicChangesSince } from '@/lib/rules-api/changes';
import { setLibrary } from '../helpers/library-holder';
import { standardLibrary } from '../helpers/fixture-library';

const ids = (rules: { id: string }[]) => rules.map((r) => r.id);
const get = (route: (req: Request) => Promise<Response>, path: string) => route(new Request(`https://elsewhere.test${path}`));

describe('tokenize', () => {
  it('drops stopwords and stems common suffixes', () => {
    expect(tokenize('My flight was Cancelled, what am I owed?')).toEqual(['flight', 'cancell', 'ow']);
    expect(tokenize('cancellation canceled')).toEqual(['cancell', 'cancel']);
  });
});

describe('searchRules', () => {
  it('finds the refund rule by natural language', () => {
    expect(ids(searchRules(standardLibrary(), { q: 'cancelled flight refund' }))[0]).toBe('test-cancelled-refund');
  });

  it('never returns drafts, even searched for directly', () => {
    expect(searchRules(standardLibrary(), { q: 'secret draft rule' })).toEqual([]);
  });

  it('excludes retired rules unless asked for', () => {
    expect(ids(searchRules(standardLibrary(), { q: 'voucher' }))).toEqual([]);
    expect(ids(searchRules(standardLibrary(), { q: 'voucher', status: 'retired' }))).toEqual(['test-old-voucher-rule']);
  });

  it('lists everything public by id when there is no query', () => {
    expect(ids(searchRules(standardLibrary(), {}))).toEqual(['test-cancelled-refund', 'test-tarmac-delay']);
  });
});

describe('GET /api/rules', () => {
  it('returns summaries and a count', async () => {
    setLibrary(standardLibrary());
    const body = await (await get(search, '/api/rules?q=tarmac')).json();
    expect(body.data.count).toBe(1);
    expect(body.data.rules[0]).toMatchObject({ id: 'test-tarmac-delay', status: 'needs_review' });
    expect(body.data.rules[0].notice).toBeDefined();
  });

  it('rejects status=draft and unknown domains', async () => {
    setLibrary(standardLibrary());
    expect((await get(search, '/api/rules?status=draft')).status).toBe(400);
    expect((await get(search, '/api/rules?domain=cruises')).status).toBe(400);
  });
});

describe('GET /api/rules/changes', () => {
  it('lists public changes since a date, newest first, without drafts', async () => {
    setLibrary(standardLibrary());
    const body = await (await get(changes, '/api/rules/changes?since=2026-09-01')).json();
    expect(body.data.changes).toEqual([
      { rule_id: 'test-tarmac-delay', kind: 'needs_review', from_version: 1, to_version: 2, status: 'needs_review', date: '2026-10-05' },
      { rule_id: 'test-cancelled-refund', kind: 'added', from_version: null, to_version: 1, status: 'verified', date: '2026-10-01' },
    ]);
  });

  it('filters by date and rejects a malformed since', async () => {
    setLibrary(standardLibrary());
    const body = await (await get(changes, '/api/rules/changes?since=2026-10-02')).json();
    expect(body.data.changes).toHaveLength(1);
    expect((await get(changes, '/api/rules/changes?since=last-week')).status).toBe(400);
  });
});

describe('hardening', () => {
  it('rejects bad limits and impossible dates', async () => {
    setLibrary(standardLibrary());
    for (const limit of ['0', '51', '1.5', 'abc', '', '1e1']) {
      expect((await get(search, `/api/rules?limit=${limit}`)).status).toBe(400);
    }
    expect((await get(search, '/api/rules?limit=5')).status).toBe(200);
    for (const since of ['2026-02-30', '2026-13-01', '2026-1-1', '']) {
      expect((await get(changes, `/api/rules/changes?since=${since}`)).status).toBe(400);
    }
  });

  it('bounds q at 2000 characters and tokenizes long input quickly', async () => {
    setLibrary(standardLibrary());
    expect((await get(search, `/api/rules?q=${'a'.repeat(2001)}`)).status).toBe(400);
    const start = Date.now();
    tokenize('s'.repeat(2000));
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('no status/domain/jurisdiction combination surfaces a draft', async () => {
    setLibrary(standardLibrary());
    for (const status of ['', 'draft', 'verified', 'needs_review', 'retired']) {
      const body = await (await get(search, `/api/rules?limit=50&status=${status}`)).json();
      const text = JSON.stringify(body);
      expect(text).not.toContain('"draft"');
      expect(text).not.toContain('secret');
    }
  });

  it('publicChanges drops changes of non-public rules', () => {
    const lib = standardLibrary();
    const draftId = lib.rules.find((r) => r.status === 'draft')!.id;
    lib.changes.push({ rule_id: draftId, from_version: 1, to_version: 2, from_status: 'verified', to_status: 'verified', date: '2026-10-06' });
    expect(publicChanges(lib).some((c) => c.rule_id === draftId)).toBe(false);
    expect(publicChangesSince(lib, '2026-01-01').some((c) => c.rule_id === draftId)).toBe(false);
  });
});
