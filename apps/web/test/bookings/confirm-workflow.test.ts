import { beforeEach, describe, expect, it, vi } from 'vitest';

const onBookingsConfirmed = vi.hoisted(() => vi.fn());
vi.mock('@/lib/bookings/confirm', () => ({ onBookingsConfirmed }));
const start = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('workflow/api', () => ({ start }));
vi.mock('@/workflows/segment-monitor', () => ({ segmentMonitorWorkflow: 'monitor' }));

import { FatalError } from 'workflow';
import { ConfigError } from '@/lib/env';
import { confirmBookingsWorkflow } from '@/workflows/confirm-bookings';

beforeEach(() => {
  onBookingsConfirmed.mockReset();
  start.mockClear();
});

describe('confirmBookingsWorkflow', () => {
  it('looks up the bookings and starts a monitor for each returned segment', async () => {
    onBookingsConfirmed.mockResolvedValue({ monitorSegmentIds: ['s1', 's2'] });
    expect(await confirmBookingsWorkflow('trip-1', ['b1'])).toEqual({ monitorSegmentIds: ['s1', 's2'] });
    expect(onBookingsConfirmed).toHaveBeenCalledWith('trip-1', ['b1']);
    expect(start.mock.calls).toEqual([['monitor', ['s1']], ['monitor', ['s2']]]);
  });

  it('turns a ConfigError into a FatalError, and leaves other errors to retry', async () => {
    onBookingsConfirmed.mockRejectedValue(new ConfigError('AEROAPI_KEY is not set'));
    await expect(confirmBookingsWorkflow('trip-1', ['b1'])).rejects.toBeInstanceOf(FatalError);
    onBookingsConfirmed.mockRejectedValue(new Error('aeroapi 503'));
    await expect(confirmBookingsWorkflow('trip-1', ['b1'])).rejects.not.toBeInstanceOf(FatalError);
    expect(start).not.toHaveBeenCalled();
  });
});
