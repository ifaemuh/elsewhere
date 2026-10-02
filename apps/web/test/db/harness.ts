import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const seedFile = path.join(repoRoot, 'supabase', 'seed.sql');

/**
 * The slice of Supabase that our migrations rely on: the auth schema, auth.uid(),
 * the three API roles, and the default grants Supabase gives them on public objects.
 */
const SUPABASE_SHIM = `
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type TestDb = PGlite;

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await db.exec(readFileSync(seedFile, 'utf8'));
  return db;
}

export async function createAuthUser(
  db: TestDb,
  user: { id: string; email?: string; phone?: string; displayName?: string },
): Promise<void> {
  await db.query('insert into auth.users (id, email, phone, raw_user_meta_data) values ($1, $2, $3, $4)', [
    user.id,
    user.email ?? null,
    user.phone ?? null,
    JSON.stringify(user.displayName ? { display_name: user.displayName } : {}),
  ]);
}

async function asRole<T>(db: TestDb, role: 'authenticated' | 'service_role', userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export function asUser<T>(db: TestDb, userId: string, fn: () => Promise<T>): Promise<T> {
  return asRole(db, 'authenticated', userId, fn);
}

export function asService<T>(db: TestDb, fn: () => Promise<T>): Promise<T> {
  return asRole(db, 'service_role', '', fn);
}
