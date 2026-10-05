import type { RulesLibrary } from '@elsewhere/rules/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/rules-library.json';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  rpcCalls: [] as { name: string; args: Row }[],
  rpcError: null as string | null,
  notified: [] as Row[],
  library: null as unknown,
}));

vi.mock('@/lib/rules/library', () => ({ getLibrary: () => h.library }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/notify/queue', () => ({ queueNotifications: async (input: Row) => void h.notified.push(input) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Row) => {
      h.rpcCalls.push({ name, args });
      return { error: h.rpcError ? { message: h.rpcError } : null };
    },
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      let upsertRow: Row | null = null;
      const rows = () => (h.tables[table] ??= []);
      const run = () => {
        if (upsertRow) {
          const dup = rows().some((r) => r.related_entity_id === upsertRow!.related_entity_id && r.title === upsertRow!.title);
          if (dup) return [];
          const created = { id: `item-${rows().length + 1}`, status: 'open', ...upsertRow };
          rows().push(created);
          return [created];
        }
        const hits = rows().filter((r) => filters.every((f) => f(r)));
        if (patch) hits.forEach((r) => Object.assign(r, patch));
        return hits;
      };
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
        update: (p: Row) => ((patch = p), q),
        upsert: (row: Row) => ((upsertRow = row), q),
        single: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: run(), error: null }),
      });
      return q;
    },
  }),
}));

import { runDocumentChecks } from '@/lib/documents/service';

const fixtureLibrary = fixture as unknown as RulesLibrary;
const checks = () => (h.rpcCalls[0]?.args.p_rows ?? []) as Row[];

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test';
  h.rpcCalls.length = 0;
  h.rpcError = null;
  h.notified.length = 0;
  h.library = fixtureLibrary;
  h.tables = {
    trips: [{ id: 't1', name: 'Lisbon', destination_country: 'PT', end_date: '2026-11-10' }],
    trip_members: [
      { id: 'm1', trip_id: 't1', user_id: 'u1' },
      { id: 'm2', trip_id: 't1', user_id: 'u2' },
    ],
    booking_segments: [],
    member_documents: [{ user_id: 'u1', kind: 'passport', issuing_country: 'US', expires_on: '2027-01-15', real_id_compliant: null }],
    action_items: [],
  };
});

const items = () => h.tables.action_items;

describe('runDocumentChecks', () => {
  it('flags the short passport, leaves the other member unknown, and never writes a date into a detail', async () => {
    await runDocumentChecks('t1');
    expect(h.rpcCalls[0].name).toBe('replace_document_checks');
    expect(checks().find((c) => c.user_id === 'u1')).toMatchObject({ result: 'action_needed', rule_id: expect.stringMatching(/passport/) });
    expect(checks().filter((c) => c.user_id === 'u2').map((c) => c.result)).toEqual(['unknown', 'unknown']);
    expect(JSON.stringify(checks())).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(JSON.stringify(items())).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]).toMatchObject({ userIds: ['u1'], tripId: 't1', template: 'document_check', urgent: false });
  });

  it('does not notify again while the item is already open', async () => {
    await runDocumentChecks('t1');
    h.notified.length = 0;
    await runDocumentChecks('t1');
    expect(h.notified).toHaveLength(0);
    expect(items()).toHaveLength(1);
    expect(items()[0].status).toBe('open');
  });

  it('closes the item once the member is no longer failing', async () => {
    await runDocumentChecks('t1');
    h.tables.member_documents[0].expires_on = '2027-09-01';
    await runDocumentChecks('t1');
    expect(items()[0].status).toBe('done');
    expect(h.notified).toHaveLength(1);
  });

  it('reopens a finished item that regressed, and notifies once', async () => {
    await runDocumentChecks('t1');
    h.tables.member_documents[0].expires_on = '2027-09-01';
    await runDocumentChecks('t1');
    h.notified.length = 0;
    h.tables.member_documents[0].expires_on = '2027-01-15';
    await runDocumentChecks('t1');
    expect(items()[0].status).toBe('open');
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]).toMatchObject({ userIds: ['u1'] });
    await runDocumentChecks('t1');
    expect(h.notified).toHaveLength(1);
  });

  describe('coverage', () => {
    const detailsAre = (detail: string) => expect(checks().every((c) => c.result === 'unknown' && c.rule_id === null && c.detail === detail)).toBe(true);

    it('says nothing was checked when the library is empty: no items, no notifications, no "ok"', async () => {
      h.library = { ...fixtureLibrary, rules: [] };
      await runDocumentChecks('t1');
      expect(checks()).toHaveLength(2);
      detailsAre('Elsewhere has no verified entry rules for this trip yet.');
      expect(items()).toHaveLength(0);
      expect(h.notified).toHaveLength(0);
    });

    it('says nothing was checked when the rules cover only other destinations', async () => {
      h.library = { ...fixtureLibrary, rules: fixtureLibrary.rules.filter((r) => r.id === 'fixture-passport-validity-pt') };
      h.tables.trips[0].destination_country = 'JP';
      await runDocumentChecks('t1');
      detailsAre('Elsewhere has no verified entry rules for this trip yet.');
      expect(items()).toHaveLength(0);
      expect(h.notified).toHaveLength(0);
    });

    it('reports ok when a covered trip has nothing that applies', async () => {
      h.tables.member_documents[0].expires_on = '2028-01-01';
      h.tables.member_documents.push({ user_id: 'u2', kind: 'passport', issuing_country: 'US', expires_on: '2028-01-01', real_id_compliant: null });
      h.tables.booking_segments.push({ origin_country: 'US', destination_country: 'PT', trip_id: 't1' });
      await runDocumentChecks('t1');
      expect(checks().map((c) => c.result)).toEqual(['ok', 'ok']);
      expect(items()).toHaveLength(0);
    });
  });

  it('throws when the replacement fails, leaving items and notifications alone', async () => {
    h.rpcError = 'boom';
    await expect(runDocumentChecks('t1')).rejects.toThrow('boom');
    expect(items()).toHaveLength(0);
    expect(h.notified).toHaveLength(0);
  });
});
