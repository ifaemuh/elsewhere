import { FatalError, createHook, sleep } from 'workflow';
import { workflowPorts, type WorkflowPorts } from '@/lib/workflows/ports';
import { segmentMonitorToken } from '@/lib/workflows/tokens';

const HOUR = 3600_000;
const MINUTE = 60_000;

export async function segmentMonitorWorkflow(segmentId: string) {
  'use workflow';
  // The token makes the run idempotent: a second start for the same segment exits.
  const claim = createHook({ token: segmentMonitorToken(segmentId) });
  if (await claim.getConflict()) return { segmentId, status: 'duplicate' as const, incidents: [] as string[] };

  const incidents: string[] = [];
  try {
    const segment = await loadSegmentStep(segmentId);
    if (!segment?.scheduledOut) return { segmentId, status: 'unresolved' as const, incidents };
    const state = await registerAlertStep(segmentId);

    const departure = new Date(segment.scheduledOut).getTime();
    const stopAt = new Date(segment.scheduledIn ?? segment.scheduledOut).getTime() + 6 * HOUR;
    const watchFrom = new Date(departure - 24 * HOUR);
    if (watchFrom.getTime() > Date.now()) await sleep(watchFrom);

    let failures = 0;
    while (Date.now() < stopAt) {
      const beforeDeparture = departure - Date.now();
      const interval = state === 'monitoring' ? (beforeDeparture > 6 * HOUR ? 6 * HOUR : HOUR) : beforeDeparture > 6 * HOUR ? 2 * HOUR : 30 * MINUTE;
      // After a failed poll, retry sooner: 5, 10, 20 minutes and so on, never later than the normal interval.
      const wait = failures === 0 ? interval : Math.min(5 * MINUTE * 2 ** (failures - 1), interval);
      await sleep(new Date(Date.now() + wait));
      const polled = await pollStep(segmentId);
      if (polled.failed) {
        failures += 1;
        if (failures === 3) await flagTroubleStep(segmentId);
        continue;
      }
      failures = 0;
      if (polled.incidentId) incidents.push(polled.incidentId);
      if (polled.ended) break;
    }
    await endStep(segmentId);
    return { segmentId, status: 'ended' as const, incidents };
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

async function loadSegmentStep(segmentId: string) {
  'use step';
  return withPorts((ports) => ports.loadSegment(segmentId));
}

async function registerAlertStep(segmentId: string) {
  'use step';
  return withPorts(async (ports) => {
    const segment = await ports.loadSegment(segmentId);
    return segment ? ports.registerAlert(segment) : ('polling_only' as const);
  });
}

async function pollStep(segmentId: string) {
  'use step';
  return withPorts((ports) => ports.pollAndRecord(segmentId));
}

async function endStep(segmentId: string) {
  'use step';
  await withPorts((ports) => ports.endSegment(segmentId));
}

async function flagTroubleStep(segmentId: string) {
  'use step';
  await withPorts((ports) => ports.flagMonitorTrouble(segmentId));
}
