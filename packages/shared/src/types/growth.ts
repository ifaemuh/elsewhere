export interface BrandedDestinationPack {
  id: string;
  sponsorName: string;
  title: string;
  destinationId: string;
  headline: string;
  ctaLabel: string;
  isActive: boolean;
  createdAt: string;
}

export type AttributionChannel = 'in_app' | 'social' | 'referral' | 'partner';

export interface AttributionTouchpoint {
  id: string;
  userId: string;
  channel: AttributionChannel;
  campaignCode: string;
  destinationName: string;
  bookedTripId: string | null;
  conversionValue: number;
  createdAt: string;
}

export interface ExperimentAssignment {
  id: string;
  userId: string;
  flagKey: string;
  variant: 'control' | 'treatment';
  assignedAt: string;
}

export type SupportOverrideKind = 'rebook' | 'protect_credit' | 'payment_extension' | 'expedite_admin';

export interface SupportOverrideAction {
  id: string;
  requestedBy: string;
  kind: SupportOverrideKind;
  targetReference: string;
  reason: string;
  status: 'submitted' | 'applied' | 'failed';
  createdAt: string;
}

export type FunnelStage = 'preview' | 'plan' | 'book';

export interface FunnelTelemetryEvent {
  id: string;
  userId: string;
  stage: FunnelStage;
  eventName: string;
  destinationName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
