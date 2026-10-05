import { resumeHook } from 'workflow/api';
import { HookNotFoundError } from 'workflow/errors';
import { tripMonitorToken } from './tokens';

/**
 * Tells a running trip monitor to look again: it restarts the monitor of every segment that has none, and
 * reschedules the briefing. A no-op when no monitor runs for the trip. Call it from a route, an action, or a step.
 */
export async function wakeTripMonitor(tripId: string): Promise<void> {
  try {
    await resumeHook(tripMonitorToken(tripId), { wake: true });
  } catch (error) {
    if (!HookNotFoundError.is(error)) throw error;
  }
}
