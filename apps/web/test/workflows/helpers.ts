import { getRun } from 'workflow/api';
import { getWorld } from 'workflow/runtime';
import { waitForSleep } from '@workflow/vitest';

type Run = Awaited<ReturnType<typeof import('workflow/api').start>>;

/** When each sleep of a run was set to end, in the order the run asked for them. */
export async function sleepResumeTimes(runId: string): Promise<number[]> {
  const world = await getWorld();
  const events = await world.events.list({ runId, pagination: { limit: 1000 }, resolveData: 'all' });
  return events.data
    .filter((e) => e.eventType === 'wait_created')
    .map((e) => new Date((e as unknown as { eventData: { resumeAt: string } }).eventData.resumeAt).getTime());
}

/** The length of each sleep after the first. The workflow's clock advances by exactly each sleep, so these are the intervals it chose. */
export async function sleepIntervals(runId: string): Promise<number[]> {
  const times = await sleepResumeTimes(runId);
  return times.slice(1).map((t, i) => t - times[i]);
}

/** Wakes the run's sleeps one at a time until it finishes. */
export async function driveToEnd(run: Run, maxSleeps = 300): Promise<void> {
  for (let i = 0; i < maxSleeps; i += 1) {
    if ((await run.status) === 'completed') return;
    try {
      const sleepId = await waitForSleep(run, { timeout: 2000 });
      await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    } catch {
      // The run finished between the check and the wait.
    }
  }
  throw new Error('run did not finish');
}
