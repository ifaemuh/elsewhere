import { beforeEach, describe, expect, it, vi } from 'vitest';

// A one-row inbound_messages table: the guarded update flips it once, as Postgres does.
const state = { status: 'quarantined', tripId: 't1' };
const closed: Record<string, string>[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const q = {
        update: () => q,
        select: () => q,
        eq: (column: string, value: string) => {
          filters[column] = value;
          return table === 'action_items' && column === 'related_entity_id' ? Promise.resolve({ error: null }).then((r) => (closed.push(filters), r)) : q;
        },
        maybeSingle: async () => {
          const match = state.status === filters.status && (!filters.trip_id || filters.trip_id === state.tripId);
          if (match) state.status = 'received';
          return { data: match ? { id: 'm1', trip_id: state.tripId } : null, error: null };
        },
      };
      return q;
    },
  }),
}));

import { approveQuarantined } from '@/lib/intake/quarantine';

beforeEach(() => {
  state.status = 'quarantined';
  closed.length = 0;
});

describe('approveQuarantined', () => {
  it('flips quarantined to received once and closes the approval item; a second call does nothing', async () => {
    expect(await approveQuarantined('m1', 't1')).toBe(true);
    expect(state.status).toBe('received');
    expect(closed).toHaveLength(1);
    expect(await approveQuarantined('m1', 't1')).toBe(false);
    expect(closed).toHaveLength(1);
  });

  it('will not approve another trip’s message', async () => {
    expect(await approveQuarantined('m1', 't2')).toBe(false);
    expect(state.status).toBe('quarantined');
  });

  it('lets /admin approve without naming a trip', async () => {
    expect(await approveQuarantined('m1', null)).toBe(true);
  });
});
