import { getRun, start } from 'workflow/api';
import { waitForSleep } from '@workflow/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryState, resetMemoryPorts } from '@/lib/workflows/memory-ports';
import { driveToEnd, sleepIntervals, sleepResumeTimes } from './helpers';
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

  describe('cadence', () => {
    const H = 3600_000;
    const M = 60_000;
    const seed = (id: string, alertId: string | null, departsInHours = 30) => {
      const state = memoryState();
      const departs = new Date(Date.now() + departsInHours * H).toISOString();
      const arrives = new Date(Date.now() + (departsInHours + 8) * H).toISOString();
      state.segments.set(id, { id, tripId: 't', ident: 'TP1', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: arrives, alertId });
      return { state, departs: Date.parse(departs) };
    };

    it('with an alert, starts watching at T-24h, then polls every 6h until T-6h and hourly after', async () => {
      const { state, departs } = seed('c1', 'a1');
      state.pollResults = [...Array(7).fill({ incidentId: null, ended: false }), { incidentId: null, ended: true }];
      const run = await start(segmentMonitorWorkflow, ['c1']);
      await driveToEnd(run);
      const times = await sleepResumeTimes(run.runId);
      expect(times[0]).toBe(departs - 24 * H);
      expect(await sleepIntervals(run.runId)).toEqual([6 * H, 6 * H, 6 * H, H, H, H, H, H]);
    });

    it('without an alert, polls every 2h until T-6h and every 30 minutes after', async () => {
      const { state } = seed('c2', null);
      state.alertFails = true;
      state.pollResults = [...Array(11).fill({ incidentId: null, ended: false }), { incidentId: null, ended: true }];
      const run = await start(segmentMonitorWorkflow, ['c2']);
      await driveToEnd(run);
      expect((await sleepIntervals(run.runId)).slice(0, 12)).toEqual([...Array(9).fill(2 * H), 30 * M, 30 * M, 30 * M]);
    });

    it('backs off 5, 10, 20 and 40 minutes after failed polls, then returns to the normal interval after a good one', async () => {
      const { state } = seed('c3', 'a3');
      state.pollResults = [
        { incidentId: null, ended: false, failed: true },
        { incidentId: null, ended: false, failed: true },
        { incidentId: null, ended: false, failed: true },
        { incidentId: null, ended: false, failed: true },
        { incidentId: null, ended: false },
        { incidentId: null, ended: true },
      ];
      const run = await start(segmentMonitorWorkflow, ['c3']);
      await driveToEnd(run);
      // 6h to the first poll; then 5, 10, 20 and 40 minutes after each failure; the poll that succeeds is followed by the normal 6h.
      expect(await sleepIntervals(run.runId)).toEqual([6 * H, 5 * M, 10 * M, 20 * M, 40 * M, 6 * H]);
      expect(state.troubled).toEqual(['c3']);
    });
  });

  describe('stop time', () => {
    const H = 3600_000;

    it('keeps polling a delayed flight past its original stop, and stops at 48h past the scheduled arrival', async () => {
      const state = memoryState();
      const departs = new Date(Date.now() + 2 * H).toISOString();
      const arrives = new Date(Date.now() + 4 * H).toISOString();
      state.segments.set('late', { id: 'late', tripId: 't', ident: 'TP9', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: arrives, alertId: 'a' });
      // Always "still delayed, arriving in 100h": without the cap the monitor would poll for over 100 hours.
      const far = new Date(Date.now() + 100 * H).toISOString();
      state.pollResults = Array.from({ length: 200 }, () => ({ incidentId: null, ended: false, latestArrival: far }));
      const run = await start(segmentMonitorWorkflow, ['late']);
      await driveToEnd(run);
      const polls = state.calls.filter((c) => c === 'poll:late').length;
      // Hourly polls: the original stop (arrival + 6h) allows about 10; the cap (arrival + 48h) about 52.
      expect(polls).toBeGreaterThan(20);
      expect(polls).toBeLessThanOrEqual(53);
      expect(state.ended).toContain('late');
    });

    it('stops at the original time when the flight runs to schedule', async () => {
      const state = memoryState();
      const departs = new Date(Date.now() + 2 * H).toISOString();
      const arrives = new Date(Date.now() + 4 * H).toISOString();
      state.segments.set('ontime', { id: 'ontime', tripId: 't', ident: 'TP8', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: arrives, alertId: 'a' });
      state.pollResults = Array.from({ length: 200 }, () => ({ incidentId: null, ended: false, latestArrival: arrives }));
      const run = await start(segmentMonitorWorkflow, ['ontime']);
      await driveToEnd(run);
      const polls = state.calls.filter((c) => c === 'poll:ontime').length;
      expect(polls).toBeLessThanOrEqual(11);
      expect(polls).toBeGreaterThan(5);
    });
  });
});
