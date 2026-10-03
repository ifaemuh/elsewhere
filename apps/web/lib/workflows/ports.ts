import type { PlannerAnswer, PlannerQuestion } from '@/lib/assist/questions';
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
  /** A monitor started for a segment that has already ended does nothing. */
  monitorState?: 'idle' | 'monitoring' | 'polling_only' | 'ended';
}

export interface WorkflowPorts {
  listMonitorableSegmentIds(tripId: string): Promise<string[]>;
  tripTiming(tripId: string): Promise<{ firstDeparture: string | null; tripEnd: string | null }>;
  preTripChecks(tripId: string): Promise<void>;
  loadSegment(segmentId: string): Promise<MonitoredSegment | null>;
  registerAlert(segment: MonitoredSegment): Promise<'monitoring' | 'polling_only'>;
  /** `latestArrival` is the actual or estimated arrival when AeroAPI has one: the monitor keeps watching until 6h after it. */
  pollAndRecord(segmentId: string): Promise<{ incidentId: string | null; ended: boolean; failed?: boolean; latestArrival?: string | null }>;
  endSegment(segmentId: string): Promise<void>;
  flagMonitorTrouble(segmentId: string): Promise<void>;
  assessIncident(incidentId: string): Promise<{ question: PlannerQuestion | null }>;
  /** True once the group has been notified of the incident. */
  isNotified(incidentId: string): Promise<boolean>;
  /** The early heads-up to the affected people (or the planner, when nobody is on the booking). */
  alertAffected(incidentId: string): Promise<void>;
  askPlanner(incidentId: string, question: PlannerQuestion): Promise<void>;
  recordAnswer(incidentId: string, answer: PlannerAnswer | null): Promise<void>;
  generatePlaybook(incidentId: string): Promise<{ playbookId: string; held: boolean }>;
  requestReview(incidentId: string): Promise<void>;
  releaseHeldPlaybooks(incidentId: string): Promise<void>;
  notifyAffected(incidentId: string): Promise<void>;
  unnotifiedIncidentIds(segmentId: string): Promise<string[]>;
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
