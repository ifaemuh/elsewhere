import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert }) }) }));

import { recordEvent } from '@/lib/funnel/events';

const error = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  insert.mockReset();
  error.mockClear();
});

describe('recordEvent', () => {
  it('treats a second booking_forwarded for the trip (23505) as a quiet no-op', async () => {
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "funnel_forwarded_trip_idx"' } });
    await recordEvent({ anonymousId: 'a'.repeat(32), event: 'booking_forwarded', tripId: 'trip-1' });
    expect(error).not.toHaveBeenCalled();
  });

  it('still logs any other failure', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    await recordEvent({ anonymousId: 'a'.repeat(32), event: 'booking_forwarded', tripId: 'trip-1' });
    expect(error).toHaveBeenCalledWith('funnel event failed', 'denied');
  });
});

describe('recordEventStrict', () => {
  it('treats the booking_forwarded duplicate as a no-op but throws on any other failure', async () => {
    const { recordEventStrict } = await import('@/lib/funnel/events');
    insert.mockResolvedValueOnce({ error: { code: '23505', message: 'dup' } });
    await expect(recordEventStrict({ anonymousId: 'a'.repeat(32), event: 'booking_forwarded', tripId: 't' })).resolves.toBeUndefined();
    insert.mockResolvedValueOnce({ error: { code: '42501', message: 'denied' } });
    await expect(recordEventStrict({ anonymousId: 'a'.repeat(32), event: 'booking_forwarded', tripId: 't' })).rejects.toThrow('denied');
  });
});
