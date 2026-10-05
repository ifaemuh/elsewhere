import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<[string, ...unknown[]]> = [];
let tripRow: unknown = null;
const from = vi.fn((table: string) => {
  const chain: Record<string, unknown> = {};
  const record = (name: string) => (...args: unknown[]) => {
    calls.push([`${table}.${name}`, ...args]);
    return chain;
  };
  for (const name of ['select', 'eq', 'gt']) chain[name] = record(name);
  chain.maybeSingle = async () => ({ data: tripRow });
  // Awaiting the member-count chain resolves to a count.
  chain.then = (resolve: (v: unknown) => void) => resolve({ count: 3 });
  return chain;
});
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));

import { findJoinableTrip } from '@/lib/trips/join-lookup';
import { hashJoinToken } from '@/lib/trips/join-token';

const TOKEN = 'A'.repeat(22);

beforeEach(() => {
  calls.length = 0;
  from.mockClear();
  tripRow = null;
});

describe('findJoinableTrip', () => {
  it('makes no database call for a malformed token', async () => {
    expect(await findJoinableTrip('not-a-token')).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('selects only the previewable columns, by token hash, and only unexpired links', async () => {
    tripRow = { id: 't1', name: 'Lisbon', start_date: '2026-11-03', end_date: '2026-11-10' };
    const found = await findJoinableTrip(TOKEN.replace(/A/g, 'B'));
    expect(found).toEqual({ trip: tripRow, memberCount: 3 });
    expect(calls).toContainEqual(['trips.select', 'id, name, start_date, end_date']);
    expect(calls).toContainEqual(['trips.eq', 'join_token_hash', hashJoinToken('B'.repeat(22))]);
    const gt = calls.find(([name]) => name === 'trips.gt')!;
    expect(gt[1]).toBe('join_token_expires_at');
    expect(Math.abs(new Date(gt[2] as string).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('returns null, with no member count, when no trip matches', async () => {
    expect(await findJoinableTrip(TOKEN.replace(/A/g, 'C'))).toBeNull();
    expect(calls.some(([name]) => name.startsWith('trip_members'))).toBe(false);
  });
});
