import type { RulesLibrary } from '@elsewhere/rules/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/rules-library.json';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[] | Row>,
  inserted: [] as { table: string; rows: Row[] }[],
  upserted: [] as Row[],
  notified: [] as Row[],
  newItems: true,
}));

vi.mock('@/lib/rules/library', () => ({ getLibrary: () => fixture as unknown as RulesLibrary }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/notify/queue', () => ({ queueNotifications: async (input: Row) => void h.notified.push(input) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        in: () => q,
        single: async () => ({ data: h.tables[table] }),
        delete: () => q,
        insert: async (rows: Row[]) => void h.inserted.push({ table, rows }),
        upsert: (row: Row) => {
          h.upserted.push(row);
          return { select: async () => ({ data: h.newItems ? [{ id: 'item' }] : [] }) };
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: h.tables[table] ?? [] }),
      });
      return q;
    },
  }),
}));

import { runDocumentChecks } from '@/lib/documents/service';

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test';
  h.inserted.length = 0;
  h.upserted.length = 0;
  h.notified.length = 0;
  h.newItems = true;
  h.tables = {
    trips: { id: 't1', name: 'Lisbon', destination_country: 'PT', end_date: '2026-11-10' },
    trip_members: [
      { id: 'm1', user_id: 'u1' },
      { id: 'm2', user_id: 'u2' },
    ],
    booking_segments: [],
    member_documents: [{ user_id: 'u1', kind: 'passport', issuing_country: 'US', expires_on: '2027-01-15', real_id_compliant: null }],
  };
});

describe('runDocumentChecks', () => {
  it('flags the member whose passport is short, leaves the other unknown, and never writes a date into a detail', async () => {
    await runDocumentChecks('t1');
    const checks = h.inserted.find((i) => i.table === 'document_checks')!.rows;
    expect(checks.find((c) => c.user_id === 'u1')).toMatchObject({ result: 'action_needed', rule_id: expect.stringMatching(/passport/) });
    expect(checks.filter((c) => c.user_id === 'u2').map((c) => c.result)).toEqual(['unknown', 'unknown']); // passport, and REAL ID while no flights are known
    expect(JSON.stringify(checks)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(JSON.stringify(h.upserted)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]).toMatchObject({ userIds: ['u1'], tripId: 't1', template: 'document_check', urgent: false });
  });

  it('does not notify again when the action item already exists', async () => {
    h.newItems = false;
    await runDocumentChecks('t1');
    expect(h.notified).toHaveLength(0);
  });
});
