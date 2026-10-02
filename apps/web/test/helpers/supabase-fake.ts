export interface KeyRow {
  id: string;
  partner_id: string;
  key_hash: string;
  rate_limit_rule: string;
  revoked_at: string | null;
}

export const fakeDb = {
  apiKeys: [] as KeyRow[],
  apiKeyError: null as string | null,
  apiKeyLookups: 0,
  events: [] as Record<string, unknown>[],
  funnel: [] as { event_name: string; metadata: Record<string, unknown> }[],
  reset(): void {
    fakeDb.apiKeys = [];
    fakeDb.apiKeyError = null;
    fakeDb.apiKeyLookups = 0;
    fakeDb.events = [];
    fakeDb.funnel = [];
  },
};

export const supabaseFake = {
  from(table: string) {
    if (table === 'api_keys') {
      const filters: Array<(row: KeyRow) => boolean> = [];
      const query = {
        select: (_columns: string) => query,
        eq: (column: keyof KeyRow, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        is: (column: keyof KeyRow, value: null) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        maybeSingle: async () => {
          fakeDb.apiKeyLookups += 1;
          if (fakeDb.apiKeyError) return { data: null, error: new Error(fakeDb.apiKeyError) };
          const row = fakeDb.apiKeys.find((r) => filters.every((f) => f(r)));
          return {
            data: row ? { id: row.id, partner_id: row.partner_id, rate_limit_rule: row.rate_limit_rule } : null,
            error: null,
          };
        },
      };
      return query;
    }
    if (table === 'rules_api_events') {
      return {
        insert: async (row: Record<string, unknown>) => {
          fakeDb.events.push(row);
          return { error: null };
        },
      };
    }
    throw new Error(`supabaseFake: unexpected table ${table}`);
  },
};
