import { afterEach, describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { insertEvent, sanitizeQuery, scheduleEvent, type RulesApiEvent } from '@/lib/rules-api/analytics';
import { fakeDb, supabaseFake } from '../helpers/supabase-fake';

const base: RulesApiEvent = {
  surface: 'api',
  endpoint: 'search',
  status: 200,
  client_name: 'curl/8.7.1',
  client_version: null,
  tier: 'anonymous',
  key_id: null,
  rule_ids: [],
  fact_names: [],
  event_type: null,
  missing_facts: [],
  query: null,
  result_count: 0,
  library_version: '2026-10-06.abc1234',
  latency_ms: 5,
};

describe('sanitizeQuery', () => {
  it('redacts emails', () => {
    expect(sanitizeQuery('refund for jo@example.com please')).toBe('refund for [redacted] please');
  });

  it('redacts phone numbers with 10 or more digits but keeps dates', () => {
    expect(sanitizeQuery('call me at +1 (415) 555-0100')).toBe('call me at [redacted]');
    expect(sanitizeQuery('call 415.555.0100 now')).toBe('call [redacted] now');
    expect(sanitizeQuery('call 4155550100 now')).toBe('call [redacted] now');
    expect(sanitizeQuery('flight on 2026-10-06')).toBe('flight on 2026-10-06');
  });

  it('truncates to 200 characters and nulls empty input', () => {
    expect(sanitizeQuery('a'.repeat(300))).toHaveLength(200);
    expect(sanitizeQuery('   ')).toBeNull();
    expect(sanitizeQuery(undefined)).toBeNull();
  });

  it('redacts before truncating so a number on the boundary never leaks', () => {
    expect(sanitizeQuery('a'.repeat(195) + ' 4155550100 tail')).toBe('a'.repeat(195) + ' [red');
  });

  it('truncates by code point so an emoji at the boundary is not split', () => {
    const out = sanitizeQuery('a'.repeat(199) + '\u{1F600}\u{1F600}')!;
    expect(out).toBe('a'.repeat(199) + '\u{1F600}');
  });
});

describe('scheduleEvent', () => {
  it('defers a sanitized insert with after()', async () => {
    scheduleEvent({ ...base, query: 'refund for jo@example.com', client_name: 'x'.repeat(300) });
    expect(after).toHaveBeenCalledTimes(1);
    expect(fakeDb.events).toHaveLength(0);

    const task = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await task();

    expect(fakeDb.events).toHaveLength(1);
    expect(fakeDb.events[0]).toMatchObject({ endpoint: 'search', query: 'refund for [redacted]' });
    expect(String(fakeDb.events[0].client_name)).toHaveLength(120);
  });

  it('keeps only known fact names and drops unknown ones', async () => {
    scheduleEvent({
      ...base,
      fact_names: ['event.type', 'jo@example.com', 'passenger.name=Jo'],
      missing_facts: ['event.type', 'not.a.fact'],
    });
    await (vi.mocked(after).mock.calls.at(-1)![0] as () => Promise<void>)();
    expect(fakeDb.events[0]).toMatchObject({ fact_names: ['event.type'], missing_facts: ['event.type'] });
  });

  it('rounds and clamps integer columns', async () => {
    scheduleEvent({ ...base, latency_ms: 12.7, status: 200.2, result_count: -3 });
    await (vi.mocked(after).mock.calls.at(-1)![0] as () => Promise<void>)();
    expect(fakeDb.events[0]).toMatchObject({ latency_ms: 13, status: 200, result_count: 0 });
  });

  it('allowlists event_type and filters rule_ids', async () => {
    scheduleEvent({ ...base, event_type: 'cancellation', rule_ids: ['eu-261', 'Bad Id', 'x'.repeat(121), 'jo@example.com'] });
    scheduleEvent({ ...base, event_type: 'jo@example.com', rule_ids: Array.from({ length: 60 }, (_, i) => `r-${i}`) });
    for (const c of vi.mocked(after).mock.calls.slice(-2)) await (c[0] as () => Promise<void>)();
    expect(fakeDb.events[0]).toMatchObject({ event_type: 'cancellation', rule_ids: ['eu-261'] });
    expect(fakeDb.events[1].event_type).toBeNull();
    expect(fakeDb.events[1].rule_ids).toHaveLength(50);
  });

  it('inserts only the table columns', async () => {
    scheduleEvent({ ...base, ip: '1.2.3.4' } as RulesApiEvent);
    await (vi.mocked(after).mock.calls.at(-1)![0] as () => Promise<void>)();
    expect(Object.keys(fakeDb.events[0]).sort()).toEqual(Object.keys(base).sort());
  });
});

describe('insertEvent failures', () => {
  afterEach(() => vi.restoreAllMocks());

  it('swallows and logs only the message when the insert returns an error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(supabaseFake, 'from').mockReturnValue({
      insert: async () => ({ error: { message: 'boom' } }),
    } as never);
    await expect(insertEvent({ ...base, query: 'secret' })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith('[rules-api] analytics insert failed:', 'boom');
  });

  it('swallows and logs only the message when the insert throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(supabaseFake, 'from').mockImplementation(() => {
      throw new Error('network down');
    });
    await expect(insertEvent(base)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith('[rules-api] analytics insert failed:', 'network down');
  });
});
