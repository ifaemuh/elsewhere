import { FatalError, createHook, sleep } from 'workflow';
import { start } from 'workflow/api';
import { workflowPorts, type WorkflowPorts } from '@/lib/workflows/ports';
import { tripMonitorToken } from '@/lib/workflows/tokens';
import { segmentMonitorWorkflow } from './segment-monitor';

const DAY = 24 * 3600_000;

/**
 * Started when a trip pass activates. Fans out one monitor per confirmed segment, briefs the group once at T-72h
 * of the first departure, then ends a week after the trip.
 *
 * Every wait is raced against the run's own hook (`wakeTripMonitor`). A wake means something changed: a flight
 * was confirmed, a segment monitor died, or /admin asked for a restart. The run then starts a monitor for every
 * monitorable segment (the ones still running exit as duplicates) and works out the briefing time again.
 */
export async function tripMonitorWorkflow(tripId: string) {
  'use workflow';
  // The token makes a restart from /admin safe: while a run watches the trip, a second one exits, so the group is never briefed twice.
  const claim = createHook<{ wake: true }>({ token: tripMonitorToken(tripId) });
  if (await claim.getConflict()) return { tripId, status: 'duplicate' as const, segments: 0 };

  try {
    const wakes = claim[Symbol.asyncIterator]();
    let wake = wakes.next();
    // Resolves 'woken' if someone woke the run before `until`; otherwise 'time'. The sleep it leaves behind is harmless.
    const wait = async (until: number): Promise<'woken' | 'time'> => {
      const outcome = await Promise.race([sleep(new Date(until)).then(() => 'time' as const), wake.then(() => 'woken' as const)]);
      if (outcome === 'woken') wake = wakes.next();
      return outcome;
    };

    let briefed = false;
    let segments = 0;
    for (;;) {
      const segmentIds = await listSegmentsStep(tripId);
      segments = segmentIds.length;
      for (const segmentId of segmentIds) await start(segmentMonitorWorkflow, [segmentId]);

      const timing = await timingStep(tripId);
      if (!briefed && timing.firstDeparture) {
        const briefingAt = new Date(timing.firstDeparture).getTime() - 3 * DAY;
        if (briefingAt > Date.now() && (await wait(briefingAt)) === 'woken') continue;
        await preTripStep(tripId);
        briefed = true;
      }
      // With no flights yet there is no trip end to go by: keep listening for a month.
      const endAt = timing.tripEnd ? new Date(timing.tripEnd).getTime() + 7 * DAY : Date.now() + 30 * DAY;
      if (endAt > Date.now() && (await wait(endAt)) === 'woken') continue;
      return { tripId, status: 'done' as const, segments };
    }
  } finally {
    claim.dispose();
  }
}

/** A missing setting cannot be fixed by retrying, so it becomes a FatalError; everything else keeps the default retries. */
async function withPorts<T>(run: (ports: WorkflowPorts) => Promise<T>): Promise<T> {
  const { ConfigError } = await import('@/lib/env');
  try {
    return await run(await workflowPorts());
  } catch (error) {
    if (error instanceof ConfigError) throw new FatalError(error.message);
    throw error;
  }
}

async function listSegmentsStep(tripId: string) {
  'use step';
  return withPorts((ports) => ports.listMonitorableSegmentIds(tripId));
}

async function timingStep(tripId: string) {
  'use step';
  return withPorts((ports) => ports.tripTiming(tripId));
}

async function preTripStep(tripId: string) {
  'use step';
  await withPorts((ports) => ports.preTripChecks(tripId));
}
