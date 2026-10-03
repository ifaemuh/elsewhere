import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: 'pat' }) }));
const { rpc, message, approveQuarantined, start } = vi.hoisted(() => ({
  rpc: vi.fn(),
  message: vi.fn(),
  approveQuarantined: vi.fn(),
  start: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc,
    from: (table: string) => {
      expect(table).toBe('inbound_messages');
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (column: string, value: string) => {
          filters[column] = value;
          return q;
        },
        maybeSingle: async () => ({ data: message(filters) }),
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/intake/quarantine', () => ({ approveQuarantined }));
vi.mock('workflow/api', () => ({ start }));
vi.mock('@/workflows/intake', () => ({ intakeWorkflow: 'intakeWorkflow' }));

import { approveQuarantinedMail } from '@/app/trips/[id]/feed-actions';

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true });
  message.mockReset().mockImplementation((f: Record<string, string>) => (f.trip_id === 't1' && f.id === 'm1' ? { id: 'm1' } : null));
  approveQuarantined.mockReset().mockResolvedValue(true);
  start.mockReset().mockResolvedValue(undefined);
});

describe('approveQuarantinedMail', () => {
  it('lets the planner approve their trip’s message and starts intake once', async () => {
    await approveQuarantinedMail('t1', 'm1');
    expect(approveQuarantined).toHaveBeenCalledWith('m1', 't1');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('intakeWorkflow', ['m1']);
  });

  it('refuses a non-planner before touching the message', async () => {
    rpc.mockResolvedValue({ data: false });
    await expect(approveQuarantinedMail('t1', 'm1')).rejects.toThrow('Only the planner');
    expect(approveQuarantined).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses a message that belongs to another trip', async () => {
    await expect(approveQuarantinedMail('t1', 'm-other')).rejects.toThrow('not on this trip');
    expect(approveQuarantined).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('starts intake once when the button is clicked twice', async () => {
    approveQuarantined.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await approveQuarantinedMail('t1', 'm1');
    await approveQuarantinedMail('t1', 'm1');
    expect(start).toHaveBeenCalledTimes(1);
  });
});
