import { FatalError, createHook, sleep } from 'workflow';
import { start } from 'workflow/api';
import { workflowPorts, type WorkflowPorts } from '@/lib/workflows/ports';
import { tripMonitorToken } from '@/lib/workflows/tokens';
import { segmentMonitorWorkflow } from './segment-monitor';

const DAY = 24 * 3600_000;

/** Started when a trip pass activates. Fans out one monitor per confirmed segment, briefs the group at T-72h, then ends after the trip. */
export async function tripMonitorWorkflow(tripId: string) {
  'use workflow';
  // The token makes a restart from /admin safe: while a run watches the trip, a second one exits, so the group is never briefed twice.
  const claim = createHook({ token: tripMonitorToken(tripId) });
  if (await claim.getConflict()) return { tripId, status: 'duplicate' as const, segments: 0 };

  try {
    const segmentIds = await listSegmentsStep(tripId);
    for (const segmentId of segmentIds) await start(segmentMonitorWorkflow, [segmentId]);

    const timing = await timingStep(tripId);
    if (timing.firstDeparture) {
      const briefingAt = new Date(new Date(timing.firstDeparture).getTime() - 3 * DAY);
      if (briefingAt.getTime() > Date.now()) await sleep(briefingAt);
      await preTripStep(tripId);
    }
    if (timing.tripEnd) {
      const endAt = new Date(new Date(timing.tripEnd).getTime() + 7 * DAY);
      if (endAt.getTime() > Date.now()) await sleep(endAt);
    }
    return { tripId, status: 'done' as const, segments: segmentIds.length };
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
