export type DisruptionSource = 'flight' | 'hotel' | 'activity';
export type DisruptionKind = 'delayed' | 'canceled' | 'overbooked' | 'connection_risk';
export type DisruptionSeverity = 'low' | 'medium' | 'high';
export type IncidentResolution = 'monitoring' | 'auto_resolved' | 'escalation_prepared';
export type PolicyActionType = 'auto_rebook' | 'protect_credit' | 'escalate';
export type TimelineEntryType = 'ingested_event' | 'evaluated_policy' | 'executed_action';

export interface AssistDisruptionEvent {
  id: string;
  tripId: string;
  source: DisruptionSource;
  kind: DisruptionKind;
  severity: DisruptionSeverity;
  description: string;
  referenceCode: string;
  occurredAt: string;
  createdAt: string;
}

export interface AssistPolicyRule {
  id: string;
  name: string;
  appliesToSource: DisruptionSource;
  appliesToKinds: DisruptionKind[];
  minimumSeverity: DisruptionSeverity;
  allowedAction: PolicyActionType;
  requiresAutoRebook: boolean;
  requiresCreditProtection: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface AssistIncident {
  id: string;
  tripId: string;
  eventId: string;
  title: string;
  detail: string;
  severity: DisruptionSeverity;
  resolutionState: IncidentResolution;
  updatedAt: string;
  createdAt: string;
}

export interface AssistTimelineEntry {
  id: string;
  incidentId: string;
  entryType: TimelineEntryType;
  title: string;
  detail: string;
  createdAt: string;
}

export interface AssistActionRecommendation {
  id: string;
  incidentId: string;
  eventId: string;
  actionType: PolicyActionType;
  status: 'allowed' | 'blocked';
  reason: string;
  priority: number;
  createdAt: string;
}
