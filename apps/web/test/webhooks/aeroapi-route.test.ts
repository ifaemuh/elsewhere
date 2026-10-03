import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state: { insertError: { code?: string; message: string } | null; segment: { id: string } | null; deleted: string[]; releaseError: string | null } = { insertError: null, segment: { id: 's1' }, deleted: [], releaseError: null };
const record = vi.hoisted(() => vi.fn());
vi.mock('@/lib/monitor/record', () => ({ recordFlightSnapshot: record }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async () => ({ error: state.insertError }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.segment, error: null }) }) }),
      delete: () => ({ eq: () => ({ eq: async (_c: string, id: string) => (state.deleted.push(`${table}:${id}`), { error: state.releaseError ? { message: state.releaseError } : null }) }) }),
    }),
  }),
}));

beforeAll(() => {
  process.env.AEROAPI_WEBHOOK_SECRET = 'hook-secret-123';
});
beforeEach(() => {
  Object.assign(state, { insertError: null, segment: { id: 's1' }, deleted: [], releaseError: null });
  record.mockReset().mockResolvedValue({ incidentId: 'inc-1' });
});

const flight = { fa_flight_id: 'TAP204-1', cancelled: true, diverted: false, scheduled_out: null, estimated_in: null, scheduled_in: null };
const body = { alert_id: 77, event_code: 'cancelled', flight };
const post = (secret: string, payload: unknown = body) =>
  import('@/app/api/webhooks/aeroapi/[secret]/route').then(({ POST }) =>
    POST(new Request('http://test/api/webhooks/aeroapi/x', { method: 'POST', body: typeof payload === 'string' ? payload : JSON.stringify(payload) }), { params: Promise.resolve({ secret }) }),
  );

describe('POST /api/webhooks/aeroapi/[secret]', () => {
  it('answers 404 for a wrong or different-length secret, touching nothing', async () => {
    expect((await post('nope')).status).toBe(404);
    expect((await post('hook-secret-124')).status).toBe(404);
    expect(record).not.toHaveBeenCalled();
  });

  it('answers 404 when no secret is configured', async () => {
    const saved = process.env.AEROAPI_WEBHOOK_SECRET;
    delete process.env.AEROAPI_WEBHOOK_SECRET;
    try {
      expect((await post('')).status).toBe(404);
    } finally {
      process.env.AEROAPI_WEBHOOK_SECRET = saved;
    }
  });

  it('answers 400 for a body that is not an alert', async () => {
    expect((await post('hook-secret-123', 'not json')).status).toBe(400);
    expect((await post('hook-secret-123', { alert_id: 1 })).status).toBe(400);
  });

  it('records the snapshot against the segment that owns the alert', async () => {
    const res = await post('hook-secret-123');
    expect(await res.json()).toEqual({ incidentId: 'inc-1' });
    expect(record).toHaveBeenCalledWith('s1', expect.objectContaining({ cancelled: true, faFlightId: 'TAP204-1' }), 'alert');
  });

  it('ignores a repeated delivery', async () => {
    state.insertError = { code: '23505', message: 'dup' };
    expect(await (await post('hook-secret-123')).json()).toMatchObject({ duplicate: expect.any(String) });
    expect(record).not.toHaveBeenCalled();
  });

  it('ignores an alert no segment owns', async () => {
    state.segment = null;
    expect(await (await post('hook-secret-123')).json()).toEqual({ ignored: 'unknown alert' });
  });

  it('releases the delivery claim when recording fails, so the retry is processed', async () => {
    record.mockRejectedValue(new Error('db down'));
    await expect(post('hook-secret-123')).rejects.toThrow('db down');
    expect(state.deleted).toHaveLength(1);
  });

  it('logs, and still raises the recording error, when the claim cannot be released', async () => {
    record.mockRejectedValue(new Error('db down'));
    state.releaseError = 'release failed';
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(post('hook-secret-123')).rejects.toThrow('db down');
      expect(error).toHaveBeenCalledWith('could not release the aeroapi delivery claim', expect.any(String), 'release failed');
    } finally {
      error.mockRestore();
    }
  });
});
