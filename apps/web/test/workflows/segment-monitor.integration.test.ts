import { getRun, start } from 'workflow/api';
import { waitForSleep } from '@workflow/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryState, resetMemoryPorts } from '@/lib/workflows/memory-ports';
import { segmentMonitorWorkflow } from '@/workflows/segment-monitor';

beforeEach(() => resetMemoryPorts());

describe('segmentMonitorWorkflow', () => {
  it('falls back to polling when alert registration fails, records an incident, and stops at arrival', async () => {
    const state = memoryState();
    const departs = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
    const arrives = new Date(Date.now() + 38 * 60 * 60 * 1000).toISOString();
    state.segments.set('seg-1', { id: 'seg-1', tripId: 'trip-1', ident: 'TP204', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: arrives, alertId: null });
    state.alertFails = true;
    state.pollResults = [
      { incidentId: null, ended: false },
      { incidentId: 'inc-1', ended: false },
      { incidentId: null, ended: true },
    ];

    const run = await start(segmentMonitorWorkflow, ['seg-1']);
    for (let i = 0; i < 4; i += 1) {
      const sleepId = await waitForSleep(run);
      await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
      if (state.pollResults.length === 0) break;
    }
    const result = await run.returnValue;

    expect(state.monitorStates.get('seg-1')).toBe('polling_only');
    expect(result).toEqual({ segmentId: 'seg-1', status: 'ended', incidents: ['inc-1'] });
    expect(state.ended).toContain('seg-1');
  });

  it('exits when another run already watches the segment', async () => {
    const state = memoryState();
    const departs = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
    state.segments.set('seg-2', { id: 'seg-2', tripId: 'trip-1', ident: 'TP205', departureDate: departs.slice(0, 10), originIata: 'LIS', destinationIata: 'EWR', scheduledOut: departs, scheduledIn: departs, alertId: 'a1' });
    const first = await start(segmentMonitorWorkflow, ['seg-2']);
    await waitForSleep(first);
    const second = await start(segmentMonitorWorkflow, ['seg-2']);
    expect(await second.returnValue).toEqual({ segmentId: 'seg-2', status: 'duplicate', incidents: [] });
    await getRun(first.runId).cancel();
  });

  it('keeps watching through AeroAPI errors, and flags the segment after three in a row', async () => {
    const state = memoryState();
    const departs = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
    const arrives = new Date(Date.now() + 38 * 60 * 60 * 1000).toISOString();
    state.segments.set('seg-3', { id: 'seg-3', tripId: 'trip-1', ident: 'TP206', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: arrives, alertId: 'a3' });
    state.pollResults = [
      { incidentId: null, ended: false, failed: true },
      { incidentId: null, ended: false, failed: true },
      { incidentId: null, ended: false, failed: true },
      { incidentId: null, ended: true },
    ];

    const run = await start(segmentMonitorWorkflow, ['seg-3']);
    // One sleep until T-24h, then one before each of the four polls.
    for (let i = 0; i < 5; i += 1) {
      const sleepId = await waitForSleep(run);
      await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    }
    const result = await run.returnValue;

    expect(state.troubled).toEqual(['seg-3']);
    expect(result).toEqual({ segmentId: 'seg-3', status: 'ended', incidents: [] });
  });
});
