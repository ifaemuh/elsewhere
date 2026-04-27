import type { AssistPolicyRule, DisruptionKind, DisruptionSource, PolicyActionType, DisruptionSeverity } from '../types/assist';

type PolicyRuleSeed = Omit<AssistPolicyRule, 'id' | 'createdAt'>;

export const DEFAULT_POLICY_RULES: PolicyRuleSeed[] = [
  {
    name: 'Auto-rebook on flight delay (medium+)',
    appliesToSource: 'flight',
    appliesToKinds: ['delayed', 'canceled'],
    minimumSeverity: 'medium',
    allowedAction: 'auto_rebook',
    requiresAutoRebook: true,
    requiresCreditProtection: false,
    isActive: true,
  },
  {
    name: 'Protect credit on flight cancellation',
    appliesToSource: 'flight',
    appliesToKinds: ['canceled'],
    minimumSeverity: 'low',
    allowedAction: 'protect_credit',
    requiresAutoRebook: false,
    requiresCreditProtection: true,
    isActive: true,
  },
  {
    name: 'Escalate hotel overbooking',
    appliesToSource: 'hotel',
    appliesToKinds: ['overbooked'],
    minimumSeverity: 'medium',
    allowedAction: 'escalate',
    requiresAutoRebook: false,
    requiresCreditProtection: false,
    isActive: true,
  },
  {
    name: 'Auto-rebook on connection risk',
    appliesToSource: 'flight',
    appliesToKinds: ['connection_risk'],
    minimumSeverity: 'high',
    allowedAction: 'auto_rebook',
    requiresAutoRebook: true,
    requiresCreditProtection: false,
    isActive: true,
  },
];

export const SEVERITY_ORDER: Record<DisruptionSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function meetsMinimumSeverity(
  actual: DisruptionSeverity,
  minimum: DisruptionSeverity,
): boolean {
  return SEVERITY_ORDER[actual] >= SEVERITY_ORDER[minimum];
}
