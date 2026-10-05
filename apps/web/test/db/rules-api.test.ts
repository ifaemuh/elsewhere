import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

async function as(role: 'anon' | 'authenticated', sql: string) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
}

describe('rules API tables', () => {
  it.each(['anon', 'authenticated'] as const)('%s cannot read api_keys or rules_api_events', async (role) => {
    await expect(as(role, 'select * from public.api_keys')).rejects.toThrow(/permission denied/);
    await expect(as(role, 'select * from public.rules_api_events')).rejects.toThrow(/permission denied/);
  });

  it('rejects a key_hash that is not 64 hex characters', async () => {
    await expect(db.query("insert into public.api_keys (partner_id, key_hash) values ('acme', 'plaintext-key')")).rejects.toThrow();
    await db.query(`insert into public.api_keys (partner_id, key_hash) values ('acme', '${'a'.repeat(64)}')`);
  });
});
