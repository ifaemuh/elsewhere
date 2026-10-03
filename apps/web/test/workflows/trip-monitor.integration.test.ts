import { getRun, start } from 'workflow/api';
import { waitForSleep } from '@workflow/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryState, resetMemoryPorts } from '@/lib/workflows/memory-ports';
import { tripMonitorWorkflow } from '@/workflows/trip-monitor';

beforeEach(() => resetMemoryPorts());

describe('tripMonitorWorkflow', () => {
  it('exits when another run already watches the trip, so a restart never briefs the group twice', async () => {
    const state = memoryState();
    const departs = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    state.segments.set('seg-t', { id: 'seg-t', tripId: 'trip-t', ident: 'TP204', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: departs, alertId: 'a1' });
    const first = await start(tripMonitorWorkflow, ['trip-t']);
    await waitForSleep(first);
    const second = await start(tripMonitorWorkflow, ['trip-t']);
    expect(await second.returnValue).toEqual({ tripId: 'trip-t', status: 'duplicate', segments: 0 });
    expect(state.preTrip).toEqual([]);
    await getRun(first.runId).cancel();
  });
});
