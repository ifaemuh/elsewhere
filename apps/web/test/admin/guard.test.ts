import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUser = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);
vi.mock('@/lib/auth/user', () => ({ requireUser }));
vi.mock('next/navigation', () => ({ notFound }));

import { adminEmails, isAdminEmail } from '@/lib/admin/emails';
import { requireAdmin } from '@/lib/admin/guard';

describe('admin guard', () => {
  it('reads a comma-separated allow list, case-insensitively', () => {
    const env = { ADMIN_EMAILS: ' Founder@Example.test , ops@example.test ' };
    expect(adminEmails(env)).toEqual(['founder@example.test', 'ops@example.test']);
    expect(isAdminEmail('FOUNDER@example.test', env)).toBe(true);
    expect(isAdminEmail('someone@example.test', env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail('founder@example.test', {})).toBe(false);
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    notFound.mockClear();
    process.env.ADMIN_EMAILS = 'founder@example.test';
  });

  it('returns the user when their email is on the list', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'Founder@example.test', phone: null });
    expect(await requireAdmin()).toMatchObject({ id: 'u1' });
  });

  it('answers a signed-in non-admin, or a phone-only user, with a 404', async () => {
    requireUser.mockResolvedValue({ id: 'u2', email: 'other@example.test', phone: null });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    requireUser.mockResolvedValue({ id: 'u3', email: null, phone: '+15551234567' });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(2);
  });

  it('refuses everyone while ADMIN_EMAILS is unset', async () => {
    delete process.env.ADMIN_EMAILS;
    requireUser.mockResolvedValue({ id: 'u1', email: 'founder@example.test', phone: null });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
