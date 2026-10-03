import { assertTestSeamAllowed } from '@/lib/env';

export interface MonitoredSegment {
  id: string;
  tripId: string;
  ident: string;
  departureDate: string;
  originIata: string;
  destinationIata: string;
  scheduledOut: string | null;
  scheduledIn: string | null;
  alertId: string | null;
}

export interface WorkflowPorts {
  listMonitorableSegmentIds(tripId: string): Promise<string[]>;
  tripTiming(tripId: string): Promise<{ firstDeparture: string | null; tripEnd: string | null }>;
  preTripChecks(tripId: string): Promise<void>;
  loadSegment(segmentId: string): Promise<MonitoredSegment | null>;
  registerAlert(segment: MonitoredSegment): Promise<'monitoring' | 'polling_only'>;
  pollAndRecord(segmentId: string): Promise<{ incidentId: string | null; ended: boolean; failed?: boolean }>;
  endSegment(segmentId: string): Promise<void>;
  flagMonitorTrouble(segmentId: string): Promise<void>;
}

/** Live ports load lazily, so memory-mode integration tests never import server-only modules. */
export async function workflowPorts(): Promise<WorkflowPorts> {
  if (process.env.ELSEWHERE_PORTS === 'memory') {
    assertTestSeamAllowed('ELSEWHERE_PORTS');
    const { memoryPorts } = await import('./memory-ports');
    return memoryPorts();
  }
  const { livePorts } = await import('./live-ports');
  return livePorts();
}
