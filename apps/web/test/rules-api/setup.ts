import { beforeEach, vi } from 'vitest';

process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test';
delete process.env.VERCEL;

vi.mock('@/lib/rules/library', async () => {
  const holder = await import('../helpers/library-holder');
  return { getLibrary: holder.getLibrary, LibraryLoadError: holder.LibraryLoadError };
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));

vi.mock('@vercel/firewall', () => ({
  checkRateLimit: vi.fn(async () => ({ rateLimited: false })),
}));

vi.mock('@/lib/supabase/admin', async () => {
  const fake = await import('../helpers/supabase-fake');
  return { createAdminClient: () => fake.supabaseFake };
});

beforeEach(async () => {
  const { fakeDb } = await import('../helpers/supabase-fake');
  const { setLibrary } = await import('../helpers/library-holder');
  fakeDb.reset();
  setLibrary(null);
});
