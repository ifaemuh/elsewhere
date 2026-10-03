import { getRun, start } from 'workflow/api';
import { waitForSleep } from '@workflow/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryState, resetMemoryPorts } from '@/lib/workflows/memory-ports';
import { wakeTripMonitor } from '@/lib/workflows/wake';
import { tripMonitorWorkflow } from '@/workflows/trip-monitor';

beforeEach(() => resetMemoryPorts());

const DAY = 24 * 3600_000;
const segment = (id: string, tripId: string, departsInDays: number) => {
  const departs = new Date(Date.now() + departsInDays * DAY).toISOString();
  return { id, tripId, ident: 'TP204', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: departs, alertId: 'a1' };
};

describe('tripMonitorWorkflow', () => {
  it('exits when another run already watches the trip, so a restart never briefs the group twice', async () => {
    const state = memoryState();
    state.segments.set('seg-t', segment('seg-t', 'trip-t', 10));
    const first = await start(tripMonitorWorkflow, ['trip-t']);
    await waitForSleep(first);
    const second = await start(tripMonitorWorkflow, ['trip-t']);
    expect(await second.returnValue).toEqual({ tripId: 'trip-t', status: 'duplicate', segments: 0 });
    expect(state.preTrip).toEqual([]);
    await getRun(first.runId).cancel();
  });

  it('starts monitors for segments that appear after it started, when woken through its hook', async () => {
    const state = memoryState();
    state.segments.set('seg-a', segment('seg-a', 'trip-w', 10));
    const run = await start(tripMonitorWorkflow, ['trip-w']);
    await waitForSleep(run);
    await vi.waitFor(() => expect(state.monitorStates.get('seg-a')).toBe('monitoring'));
    // A segment monitor died, or a flight was confirmed later: nothing else would start it.
    state.segments.set('seg-b', segment('seg-b', 'trip-w', 12));
    await wakeTripMonitor('trip-w');
    await vi.waitFor(() => expect(state.monitorStates.get('seg-b')).toBe('monitoring'));
    await getRun(run.runId).cancel();
  });

  it('schedules and sends the briefing once after a flight resolves on a trip that began with none', async () => {
    const state = memoryState();
    const run = await start(tripMonitorWorkflow, ['trip-b']);
    await waitForSleep(run);
    expect(state.preTrip).toEqual([]);

    // The flight resolves two days out, so the briefing (3 days before) is already due.
    state.segments.set('seg-late', segment('seg-late', 'trip-b', 2));
    await wakeTripMonitor('trip-b');
    await vi.waitFor(() => expect(state.preTrip).toEqual(['trip-b']));

    // Further wakes, as from more confirmations, must not brief again.
    await wakeTripMonitor('trip-b');
    state.segments.set('seg-later', segment('seg-later', 'trip-b', 1));
    await wakeTripMonitor('trip-b');
    await vi.waitFor(() => expect(state.calls.filter((c) => c === 'list:trip-b').length).toBeGreaterThanOrEqual(4));
    expect(state.preTrip).toEqual(['trip-b']);
    await getRun(run.runId).cancel();
  });

  it('moves a scheduled briefing earlier when a flight is added that leaves sooner', async () => {
    const state = memoryState();
    state.segments.set('seg-far', segment('seg-far', 'trip-e', 20));
    const run = await start(tripMonitorWorkflow, ['trip-e']);
    await waitForSleep(run);
    expect(state.preTrip).toEqual([]);
    state.segments.set('seg-near', segment('seg-near', 'trip-e', 2));
    await wakeTripMonitor('trip-e');
    await vi.waitFor(() => expect(state.preTrip).toEqual(['trip-e']));
    await getRun(run.runId).cancel();
  });
});

describe('wakeTripMonitor', () => {
  it('does nothing when no trip monitor is running', async () => {
    await expect(wakeTripMonitor('trip-none')).resolves.toBeUndefined();
  });
});
