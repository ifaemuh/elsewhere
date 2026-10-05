import { FatalError } from 'workflow';
import { start } from 'workflow/api';
import { segmentMonitorWorkflow } from './segment-monitor';

/**
 * Looks up the flights on bookings that were just confirmed or added by hand, then starts monitors.
 * A durable workflow so an AeroAPI failure retries instead of leaving the segments unresolved.
 */
export async function confirmBookingsWorkflow(tripId: string, bookingIds: string[]) {
  'use workflow';
  const monitorSegmentIds = await confirmStep(tripId, bookingIds);
  for (const segmentId of monitorSegmentIds) await start(segmentMonitorWorkflow, [segmentId]);
  // Only an active pass returns segments. A running trip monitor then re-reads the first departure and schedules the briefing.
  if (monitorSegmentIds.length > 0) await wakeStep(tripId);
  return { monitorSegmentIds };
}

// Retrying cannot fix a missing key, so ConfigError is fatal. AeroApiError and the rest keep the default retries.
async function confirmStep(tripId: string, bookingIds: string[]): Promise<string[]> {
  'use step';
  const { ConfigError } = await import('../lib/env');
  const { onBookingsConfirmed } = await import('../lib/bookings/confirm');
  try {
    return (await onBookingsConfirmed(tripId, bookingIds)).monitorSegmentIds;
  } catch (error) {
    if (error instanceof ConfigError) throw new FatalError(error.message);
    throw error;
  }
}

async function wakeStep(tripId: string): Promise<void> {
  'use step';
  await (await import('../lib/workflows/wake')).wakeTripMonitor(tripId);
}
