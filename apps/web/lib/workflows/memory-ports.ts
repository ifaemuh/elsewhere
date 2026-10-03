import type { PlannerAnswer, PlannerQuestion } from '@/lib/assist/questions';
import type { MonitoredSegment, WorkflowPorts } from './ports';

/** Shared through globalThis: steps run from generated bundles, a different module graph from the test file. */
interface MemoryState {
  segments: Map<string, MonitoredSegment>;
  alertFails: boolean;
  monitorStates: Map<string, string>;
  pollResults: { incidentId: string | null; ended: boolean; failed?: boolean; latestArrival?: string | null }[];
  ended: string[];
  troubled: string[];
  preTrip: string[];
  calls: string[];
  questions: Map<string, PlannerQuestion>;
  answers: Map<string, PlannerAnswer | null>;
  reviewed: Set<string>;
  reviewRequested: string[];
  released: string[];
  notified: string[];
  segmentIncidents: Map<string, string[]>;
}

const KEY = '__elsewhereWorkflowMemory';

export function memoryState(): MemoryState {
  const g = globalThis as unknown as Record<string, MemoryState | undefined>;
  g[KEY] ??= { segments: new Map(), alertFails: false, monitorStates: new Map(), pollResults: [], ended: [], troubled: [], preTrip: [], calls: [], questions: new Map(), answers: new Map(), reviewed: new Set(), reviewRequested: [], released: [], notified: [], segmentIncidents: new Map() };
  return g[KEY]!;
}

export function resetMemoryPorts(): void {
  (globalThis as unknown as Record<string, unknown>)[KEY] = undefined;
  memoryState();
}

export function memoryPorts(): WorkflowPorts {
  const state = memoryState();
  return {
    async listMonitorableSegmentIds(tripId) {
      state.calls.push(`list:${tripId}`);
      return [...state.segments.values()].filter((s) => s.tripId === tripId).map((s) => s.id);
    },
    async tripTiming(tripId) {
      const segments = [...state.segments.values()].filter((s) => s.tripId === tripId && s.scheduledOut);
      const firstDeparture = segments.map((s) => s.scheduledOut!).sort()[0] ?? null;
      return { firstDeparture, tripEnd: firstDeparture };
    },
    async preTripChecks(tripId) {
      state.preTrip.push(tripId);
    },
    async loadSegment(segmentId) {
      return state.segments.get(segmentId) ?? null;
    },
    async registerAlert(segment) {
      const result = state.alertFails ? 'polling_only' : 'monitoring';
      state.monitorStates.set(segment.id, result);
      return result;
    },
    async pollAndRecord(segmentId) {
      state.calls.push(`poll:${segmentId}`);
      const result = state.pollResults.shift() ?? { incidentId: null, ended: true };
      if (result.incidentId) state.segmentIncidents.set(segmentId, [...(state.segmentIncidents.get(segmentId) ?? []), result.incidentId]);
      return result;
    },
    async endSegment(segmentId) {
      state.ended.push(segmentId);
    },
    async flagMonitorTrouble(segmentId) {
      state.troubled.push(segmentId);
    },
    async assessIncident(incidentId) {
      return { question: state.answers.has(incidentId) ? null : (state.questions.get(incidentId) ?? null) };
    },
    async isNotified(incidentId) {
      return state.notified.includes(incidentId);
    },
    async askPlanner(incidentId) {
      state.calls.push(`ask:${incidentId}`);
    },
    async recordAnswer(incidentId, answer) {
      state.answers.set(incidentId, answer);
    },
    async generatePlaybook(incidentId) {
      return { playbookId: `pb-${incidentId}`, held: state.reviewed.has(incidentId) };
    },
    async requestReview(incidentId) {
      state.reviewRequested.push(incidentId);
    },
    async releaseHeldPlaybooks(incidentId) {
      state.released.push(incidentId);
    },
    async notifyAffected(incidentId) {
      state.notified.push(incidentId);
    },
    async unnotifiedIncidentIds(segmentId) {
      return (state.segmentIncidents.get(segmentId) ?? []).filter((incidentId) => !state.notified.includes(incidentId));
    },
  };
}
