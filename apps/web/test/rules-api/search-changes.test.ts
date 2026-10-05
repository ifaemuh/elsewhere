import { describe, expect, it } from 'vitest';
import { GET as search } from '@/app/api/rules/route';
import { GET as changes } from '@/app/api/rules/changes/route';
import { searchRules, stem, tokenize } from '@/lib/rules-api/search';
import { publicChanges, publicChangesSince } from '@/lib/rules-api/changes';
import { setLibrary } from '../helpers/library-holder';
import { makeLibrary, makeRule, standardLibrary, standardRules } from '../helpers/fixture-library';
import { changeKind, defaultSince } from '@/lib/rules-api/changes';

const ids = (rules: { id: string }[]) => rules.map((r) => r.id);
const get = (route: (req: Request) => Promise<Response>, path: string) => route(new Request(`https://elsewhere.test${path}`));

describe('tokenize', () => {
  it('drops stopwords and stems common suffixes', () => {
    expect(tokenize('My flight was Cancelled, what am I owed?')).toEqual(['flight', 'cancel', 'owed']);
    expect(tokenize('cancellation canceled')).toEqual(['cancel']);
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

const lib = (...extra: Parameters<typeof makeRule>[0][]) => makeLibrary([...standardRules(), ...extra.map((o) => makeRule(o))]);

describe('search quality', () => {
  it('matches cancelled and canceled both ways', () => {
    const us = lib({ id: 'test-us', title: 'Canceled trips', summary: 'The carrier canceled it.', tags: ['dot'] });
    const eu = lib({ id: 'test-eu', title: 'Cancelled trips', summary: 'The carrier cancelled it.', tags: ['eu'] });
    expect(ids(searchRules(us, { q: 'cancelled', jurisdiction: 'US-DOT' }))).toContain('test-us');
    expect(ids(searchRules(eu, { q: 'canceled', jurisdiction: 'US-DOT' }))).toContain('test-eu');
  });

  it('does not match short stems inside other words', () => {
    const l = lib({ id: 'test-show', title: 'Show and know', summary: 'You show what you know.', tags: ['misc'] });
    expect(ids(searchRules(l, { q: 'owed' }))).not.toContain('test-show');
  });

  it('keeps stems at three characters or more', () => {
    expect(stem('owed')).toBe('owed');
    expect(stem('bed')).toBe('bed');
    expect(stem('stopped')).toBe('stop');
  });

  it('ranks title over tags over summary, whole word over prefix', () => {
    const l = makeLibrary([
      makeRule({ id: 'test-a-summary', title: 'Alpha', summary: 'about zebra here', tags: ['one'] }),
      makeRule({ id: 'test-b-tags', title: 'Beta', summary: 'nothing', tags: ['zebra'] }),
      makeRule({ id: 'test-c-title', title: 'Zebra rule', summary: 'nothing', tags: ['two'] }),
      makeRule({ id: 'test-d-prefix', title: 'Zebras unite', summary: 'nothing', tags: ['three'] }),
    ]);
    expect(ids(searchRules(l, { q: 'zebra' }))).toEqual(['test-c-title', 'test-d-prefix', 'test-b-tags', 'test-a-summary']);
  });

  it('returns nothing for an all-stopword query', () => {
    expect(searchRules(standardLibrary(), { q: 'what is the' })).toEqual([]);
  });
});

describe('searchRules filters', () => {
  const l = lib({ id: 'test-eu-rule', domain: 'hotels', jurisdiction: 'EU-261', title: 'EU hotel', tags: ['eu'] });
  it('filters by domain and jurisdiction', () => {
    expect(ids(searchRules(l, { domain: 'hotels' }))).toEqual(['test-eu-rule']);
    expect(ids(searchRules(l, { jurisdiction: 'EU-261' }))).toEqual(['test-eu-rule']);
    expect(searchRules(l, { domain: 'hotels', jurisdiction: 'US-DOT' })).toEqual([]);
  });

  it('truncates to limit', () => {
    expect(searchRules(l, { limit: 1 })).toHaveLength(1);
    expect(searchRules(l, {})).toHaveLength(3);
  });

  it('never returns the draft, searched by its id, title, tag, or via any filter', () => {
    const draft = standardRules().find((r) => r.status === 'draft')!;
    for (const params of [{ q: draft.id }, { q: draft.title }, { q: 'draft' }, { status: 'draft' as never }, { domain: draft.domain }, {}]) {
      expect(ids(searchRules(standardLibrary(), params))).not.toContain(draft.id);
    }
  });

  it('API responses never contain the draft id or title', async () => {
    setLibrary(standardLibrary());
    const draft = standardRules().find((r) => r.status === 'draft')!;
    for (const path of [`/api/rules?q=${encodeURIComponent(draft.title)}`, '/api/rules?limit=50', '/api/rules/changes?since=2026-01-01']) {
      const text = await (await get(path.includes('changes') ? changes : search, path)).text();
      expect(text).not.toContain(draft.id);
      expect(text).not.toContain(draft.title);
    }
  });
});

describe('changes', () => {
  const c = (from: string | null, to: string) =>
    ({ rule_id: 'x', from_version: 1, to_version: 2, from_status: from, to_status: to, date: '2026-10-01' }) as never;

  it('classifies all four kinds, with first public appearance as added', () => {
    expect(changeKind(c(null, 'verified'))).toBe('added');
    expect(changeKind(c('draft', 'needs_review'))).toBe('added');
    expect(changeKind(c('needs_review', 'verified'))).toBe('changed');
    expect(changeKind(c('verified', 'needs_review'))).toBe('needs_review');
    expect(changeKind(c('verified', 'retired'))).toBe('retired');
  });

  it('hides draft history in public changes', () => {
    const rules = [
      makeRule({
        id: 'test-promoted',
        history: [
          { version: 1, status: 'draft', date: '2026-09-20' },
          { version: 1, status: 'verified', date: '2026-09-21' },
        ],
      }),
    ];
    const out = publicChangesSince(makeLibrary(rules), '2026-01-01');
    expect(out).toEqual([
      { rule_id: 'test-promoted', kind: 'added', from_version: null, to_version: 1, status: 'verified', date: '2026-09-21' },
    ]);
  });

  it('since is inclusive', () => {
    const l = standardLibrary();
    expect(publicChangesSince(l, '2026-10-05').map((x) => x.rule_id)).toEqual(['test-tarmac-delay']);
    expect(publicChangesSince(l, '2026-10-06')).toEqual([]);
  });

  it('defaultSince is 30 days before now', () => {
    expect(defaultSince(new Date('2026-10-31T12:00:00Z'))).toBe('2026-10-01');
  });
});
