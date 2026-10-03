import { FatalError, createHook, sleep } from 'workflow';
import { HOUR, nextStopAt, pollWait } from '@/lib/monitor/cadence';
import { workflowPorts, type WorkflowPorts } from '@/lib/workflows/ports';
import { segmentMonitorToken } from '@/lib/workflows/tokens';

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
    const scheduledEnd = new Date(segment.scheduledIn ?? segment.scheduledOut).getTime();
    // Polling runs until 6h after the flight lands. A flight known to be late moves that out, up to 48h past its schedule.
    let stopAt = nextStopAt(scheduledEnd + 6 * HOUR, scheduledEnd, null);
    // The workflow's own clock: the later of real time and the end of the last sleep, so it never runs behind its sleeps.
    let clock = Date.now();
    const now = () => Math.max(clock, Date.now());
    const watchFrom = departure - 24 * HOUR;
    if (watchFrom > now()) {
      await sleep(new Date(watchFrom));
      clock = watchFrom;
    }

    let failures = 0;
    while (now() < stopAt) {
      const wake = now() + pollWait(state, departure - now(), failures);
      await sleep(new Date(wake));
      clock = wake;
      const polled = await pollStep(segmentId);
      if (polled.failed) {
        failures += 1;
        if (failures === 3) await flagTroubleStep(segmentId);
        continue;
      }
      failures = 0;
      if (polled.incidentId) incidents.push(polled.incidentId);
      if (polled.ended) break;
      stopAt = nextStopAt(stopAt, scheduledEnd, polled.latestArrival);
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
