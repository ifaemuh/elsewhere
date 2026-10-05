import { beforeEach, describe, expect, it, vi } from 'vitest';

const runIntake = vi.hoisted(() => vi.fn());
vi.mock('@/lib/intake/orchestrate', () => ({ runIntake }));
vi.mock('../../lib/intake/orchestrate', () => ({ runIntake }));
const start = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('workflow/api', () => ({ start }));
vi.mock('@/workflows/segment-monitor', () => ({ segmentMonitorWorkflow: 'monitor' }));
vi.mock('./segment-monitor', () => ({ segmentMonitorWorkflow: 'monitor' }));
const wakeTripMonitor = vi.hoisted(() => vi.fn(async (_tripId: string) => undefined));
vi.mock('@/lib/workflows/wake', () => ({ wakeTripMonitor }));
vi.mock('../../lib/workflows/wake', () => ({ wakeTripMonitor }));

import { intakeWorkflow } from '@/workflows/intake';

beforeEach(() => {
  runIntake.mockReset();
  start.mockClear();
  wakeTripMonitor.mockClear();
});

describe('intakeWorkflow', () => {
  it('starts a monitor per segment and wakes the trip monitor when the pass is active (segments returned)', async () => {
    runIntake.mockResolvedValue({ status: 'parsed', tripId: 'trip-1', bookingIds: ['b1'], monitorSegmentIds: ['s1', 's2'] });
    await intakeWorkflow('msg-1');
    expect(start.mock.calls).toEqual([['monitor', ['s1']], ['monitor', ['s2']]]);
    expect(wakeTripMonitor).toHaveBeenCalledWith('trip-1');
  });

  it('wakes nothing when there are no segments to monitor, as without a pass', async () => {
    runIntake.mockResolvedValue({ status: 'needs_confirmation', tripId: 'trip-1', bookingIds: ['b1'], monitorSegmentIds: [] });
    await intakeWorkflow('msg-1');
    expect(start).not.toHaveBeenCalled();
    expect(wakeTripMonitor).not.toHaveBeenCalled();
  });

  it('wakes nothing for a failed or missing message', async () => {
    runIntake.mockResolvedValue({ status: 'failed', reason: 'unreadable' });
    await intakeWorkflow('msg-1');
    expect(wakeTripMonitor).not.toHaveBeenCalled();
  });
});
