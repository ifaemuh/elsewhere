export type DisruptionSource = 'flight' | 'hotel' | 'activity';
export type DisruptionKind = 'delayed' | 'canceled' | 'overbooked' | 'connection_risk';
export type DisruptionSeverity = 'low' | 'medium' | 'high';
export type IncidentResolution = 'monitoring' | 'auto_resolved' | 'escalation_prepared';
export type PolicyActionType = 'auto_rebook' | 'protect_credit' | 'escalate';
export type TimelineEntryType = 'ingested_event' | 'evaluated_policy' | 'executed_action';
export type AssistOpportunityKind =
  | 'fare_drop'
  | 'better_flight'
  | 'connection_risk'
  | 'credit_protection'
  | 'hotel_rate_drop'
  | 'cancellation_window';
export type AssistOpportunityStatus = 'monitoring' | 'action_available' | 'watching_deadline' | 'blocked';
export type TravelIntelSourceKind =
  | 'booking_record'
  | 'provider_api'
  | 'deal_feed'
  | 'reddit'
  | 'public_research'
  | 'official_policy'
  | 'fare_rule'
  | 'mock';
export type TravelIntelConfidence = 'low' | 'medium' | 'high';
export type TravelIntelUrgency = 'low' | 'medium' | 'high';

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

export interface AssistTripSegment {
  id: string;
  kind: DisruptionSource;
  providerName: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  confirmationCode: string;
  routeSummary: string | null;
  fareClass: string | null;
  policySummary: string;
}

export interface AssistRuleCitation {
  label: string;
  detail: string;
}

export interface AssistTripOpportunity {
  id: string;
  tripId: string;
  kind: AssistOpportunityKind;
  status: AssistOpportunityStatus;
  title: string;
  detail: string;
  actionLabel: string;
  priority: number;
  savingsAmount: number | null;
  protectedValue: number | null;
  deadlineAt: string | null;
  autoActionable: boolean;
  citations: AssistRuleCitation[];
}

export interface AssistCancellationOption {
  tripId: string;
  summary: string;
  refundAmount: number;
  travelCreditAmount: number;
  feeAmount: number;
  decisionWindowEndsAt: string | null;
  creditExpiresAt: string | null;
  risks: string[];
}

export interface ActiveTripGuide {
  tripId: string;
  tripName: string;
  tripTagline: string | null;
  destinationName: string;
  destinationCountry: string;
  status: 'booked' | 'in_progress' | 'draft' | 'completed';
  travelerCount: number;
  totalCost: number;
  protectedValue: number;
  potentialSavings: number;
  monitoredAt: string;
  segments: AssistTripSegment[];
  opportunities: AssistTripOpportunity[];
  cancellation: AssistCancellationOption;
}

export interface TravelProviderCoverage {
  id: string;
  name: string;
  category:
    | 'flight_search'
    | 'flight_status'
    | 'hotel_rates'
    | 'hotel_policies'
    | 'vacation_rentals'
    | 'experiences'
    | 'deal_feed'
    | 'reddit'
    | 'web_research'
    | 'ai_decisioning';
  configured: boolean;
  liveCapable: boolean;
  status: 'connected' | 'missing_credentials' | 'not_configured' | 'error';
  detail: string;
}

export interface TravelIntelFinding {
  id: string;
  tripId: string;
  sourceKind: TravelIntelSourceKind;
  sourceName: string;
  sourceUrl: string | null;
  confidence: TravelIntelConfidence;
  title: string;
  detail: string;
  observedAt: string;
  appliesToSegmentId: string | null;
  impactAmount: number | null;
  protectedValue: number | null;
  citations: AssistRuleCitation[];
}

export interface AssistDecision {
  tripId: string;
  title: string;
  recommendation: string;
  confidence: TravelIntelConfidence;
  urgency: TravelIntelUrgency;
  estimatedSavings: number;
  protectedValue: number;
  rationale: string[];
  nextSteps: string[];
  limitations: string[];
  usedAi: boolean;
}

export interface LiveTripIntelligence {
  tripId: string;
  generatedAt: string;
  providerCoverage: TravelProviderCoverage[];
  findings: TravelIntelFinding[];
  deals: TravelDealSignal[];
  decision: AssistDecision;
}

export interface TravelDealSignal {
  id: string;
  sourceKind: TravelIntelSourceKind;
  sourceName: string;
  sourceUrl: string | null;
  title: string;
  summary: string;
  origin: string | null;
  destination: string | null;
  priceAmount: number | null;
  currencyCode: string | null;
  travelWindowStart: string | null;
  travelWindowEnd: string | null;
  bookingWindowEndsAt: string | null;
  observedAt: string;
  confidence: TravelIntelConfidence;
  dealScore: number;
  relevanceScore: number;
  tags: string[];
  limitations: string[];
  citations: AssistRuleCitation[];
}

export interface DealRadarResult {
  generatedAt: string;
  providerCoverage: TravelProviderCoverage[];
  deals: TravelDealSignal[];
}
