import type { MonitoredSegment, WorkflowPorts } from './ports';

/** Shared through globalThis: steps run from generated bundles, a different module graph from the test file. */
interface MemoryState {
  segments: Map<string, MonitoredSegment>;
  alertFails: boolean;
  monitorStates: Map<string, string>;
  pollResults: { incidentId: string | null; ended: boolean; failed?: boolean }[];
  ended: string[];
  troubled: string[];
  preTrip: string[];
  calls: string[];
}

const KEY = '__elsewhereWorkflowMemory';

export function memoryState(): MemoryState {
  const g = globalThis as unknown as Record<string, MemoryState | undefined>;
  g[KEY] ??= { segments: new Map(), alertFails: false, monitorStates: new Map(), pollResults: [], ended: [], troubled: [], preTrip: [], calls: [] };
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
      return state.pollResults.shift() ?? { incidentId: null, ended: true };
    },
    async endSegment(segmentId) {
      state.ended.push(segmentId);
    },
    async flagMonitorTrouble(segmentId) {
      state.troubled.push(segmentId);
    },
  };
}
