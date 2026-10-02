import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
const inserts: Array<{ table: string; rows: unknown[] }> = [];
let updateError: { message: string } | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc,
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return { eq: async () => ({ error: updateError }) };
      },
      insert: async (rows: unknown[]) => {
        inserts.push({ table, rows });
        return { error: null };
      },
    }),
  }),
}));
let user = { id: 'user-1', email: 'pat@example.test', phone: null as string | null };
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => user }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { joinTripAction } from '@/app/join/[token]/actions';

const TOKEN = 'T'.repeat(22);
const TRIP = '11111111-1111-1111-1111-111111111111';
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries({ displayName: 'Sam', timezone: 'America/Chicago', ...values })) data.set(k, v);
  return data;
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: TRIP, error: null });
  updates.length = 0;
  inserts.length = 0;
  updateError = null;
  user = { id: 'user-1', email: 'pat@example.test', phone: null };
  delete process.env.SMS_ENABLED;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('joinTripAction', () => {
  it('rejects a malformed token without a database call', async () => {
    expect(await joinTripAction('bad', { error: null }, form({}))).toEqual({ error: 'This invite link is not valid.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('joins with the raw token and records email consent only', async () => {
    await expect(joinTripAction(TOKEN, { error: null }, form({}))).rejects.toThrow(`REDIRECT:/trips/${TRIP}`);
    expect(rpc).toHaveBeenCalledWith('join_trip', { p_token: TOKEN, p_display_name: 'Sam' });
    expect(inserts).toEqual([{ table: 'consents', rows: [{ user_id: 'user-1', kind: 'email', policy_version: 'email-2026-10' }] }]);
  });

  it('writes only the profile fields that were filled in, never clearing saved ones', async () => {
    await expect(joinTripAction(TOKEN, { error: null }, form({}))).rejects.toThrow('REDIRECT');
    expect(updates).toEqual([{ table: 'profiles', values: { timezone: 'America/Chicago' } }]);
    updates.length = 0;
    await expect(joinTripAction(TOKEN, { error: null }, form({ venmo: '@sam-pays', cashtag: '$sampays' }))).rejects.toThrow('REDIRECT');
    expect(updates[0].values).toEqual({ venmo_username: 'sam-pays', cashtag: 'sampays', timezone: 'America/Chicago' });
    expect(updates[0].values).not.toHaveProperty('sms_opt_in');
  });

  it('accepts canonical-only time zones and drops an invalid one', async () => {
    await expect(joinTripAction(TOKEN, { error: null }, form({ timezone: 'Europe/Kyiv' }))).rejects.toThrow('REDIRECT');
    expect(updates[0].values.timezone).toBe('Europe/Kyiv');
    updates.length = 0;
    await expect(joinTripAction(TOKEN, { error: null }, form({ timezone: 'asia/kolkata' }))).rejects.toThrow('REDIRECT');
    expect(updates[0].values.timezone).toBe('Asia/Kolkata');
    for (const bad of ['+05:30', '-0800', 'Mars/Base']) {
      updates.length = 0;
      await expect(joinTripAction(TOKEN, { error: null }, form({ timezone: bad }))).rejects.toThrow('REDIRECT');
      expect(updates).toEqual([]);
    }
    updates.length = 0;
    await expect(joinTripAction(TOKEN, { error: null }, form({ timezone: 'Mars/Base' }))).rejects.toThrow('REDIRECT');
    expect(updates).toEqual([]);
  });

  it('ignores an SMS opt-in while SMS is off or the account has no phone', async () => {
    user.phone = '+15551234567';
    await expect(joinTripAction(TOKEN, { error: null }, form({ smsOptIn: 'on' }))).rejects.toThrow('REDIRECT');
    expect(updates[0].values).not.toHaveProperty('sms_opt_in');
    expect(JSON.stringify(inserts)).not.toContain('"sms"');
    process.env.SMS_ENABLED = 'true';
    user.phone = null;
    inserts.length = 0;
    await expect(joinTripAction(TOKEN, { error: null }, form({ smsOptIn: 'on' }))).rejects.toThrow('REDIRECT');
    expect(JSON.stringify(inserts)).not.toContain('"sms"');
  });

  it('records the opt-in and an sms consent row once SMS is on and the phone is verified', async () => {
    process.env.SMS_ENABLED = 'true';
    user.phone = '+15551234567';
    await expect(joinTripAction(TOKEN, { error: null }, form({ smsOptIn: 'on' }))).rejects.toThrow('REDIRECT');
    expect(updates[0].values.sms_opt_in).toBe(true);
    expect(inserts[0].rows).toEqual([
      { user_id: 'user-1', kind: 'email', policy_version: 'email-2026-10' },
      { user_id: 'user-1', kind: 'sms', policy_version: 'sms-2026-10' },
    ]);
  });

  it('logs only the message when the profile update fails, and still joins', async () => {
    updateError = { message: 'permission denied' };
    await expect(joinTripAction(TOKEN, { error: null }, form({}))).rejects.toThrow(`REDIRECT:/trips/${TRIP}`);
    expect(console.error).toHaveBeenCalledWith('join: profile update failed', 'permission denied');
  });

  it('gives the expired-link message when join_trip fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid or expired link' } });
    expect(await joinTripAction(TOKEN, { error: null }, form({}))).toEqual({ error: 'This invite link has expired. Ask the planner for a new one.' });
    expect(updates).toEqual([]);
  });
});
