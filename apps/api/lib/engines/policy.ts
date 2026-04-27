import { SupabaseClient } from '@supabase/supabase-js';
import type {
  DisruptionSource,
  DisruptionKind,
  DisruptionSeverity,
  PolicyActionType,
} from '@elsewhere/shared';
import { meetsMinimumSeverity } from '@elsewhere/shared';

interface PolicyRuleRow {
  id: string;
  name: string;
  applies_to_source: DisruptionSource;
  applies_to_kinds: DisruptionKind[];
  minimum_severity: DisruptionSeverity;
  allowed_action: PolicyActionType;
  requires_auto_rebook: boolean;
  requires_credit_protection: boolean;
  is_active: boolean;
}

interface UserPreferences {
  isAutoRebookEnabled: boolean;
  isCreditProtectionEnabled: boolean;
}

export interface PolicyEvaluationResult {
  ruleId: string;
  ruleName: string;
  actionType: PolicyActionType;
  status: 'allowed' | 'blocked';
  reason: string;
  priority: number;
}

export async function evaluatePolicies(
  supabase: SupabaseClient,
  event: {
    id: string;
    source: DisruptionSource;
    kind: DisruptionKind;
    severity: DisruptionSeverity;
    tripId: string;
  },
): Promise<PolicyEvaluationResult[]> {
  // Fetch active policy rules
  const { data: rules } = await supabase
    .from('assist_policy_rules')
    .select('*')
    .eq('is_active', true);

  if (!rules?.length) return [];

  // Fetch trip owner preferences
  const { data: trip } = await supabase
    .from('trips')
    .select('owner_id')
    .eq('id', event.tripId)
    .single();

  if (!trip) return [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_auto_rebook_enabled, is_credit_protection_enabled')
    .eq('id', trip.owner_id)
    .single();

  const prefs: UserPreferences = {
    isAutoRebookEnabled: profile?.is_auto_rebook_enabled ?? false,
    isCreditProtectionEnabled: profile?.is_credit_protection_enabled ?? false,
  };

  const results: PolicyEvaluationResult[] = [];

  for (const rule of rules as PolicyRuleRow[]) {
    // Check source match
    if (rule.applies_to_source !== event.source) continue;

    // Check kind match
    if (!rule.applies_to_kinds.includes(event.kind)) continue;

    // Check severity threshold
    if (!meetsMinimumSeverity(event.severity, rule.minimum_severity)) continue;

    // Check user preference gates
    let status: 'allowed' | 'blocked' = 'allowed';
    let reason = `Policy "${rule.name}" matched: ${event.source} ${event.kind} (${event.severity})`;

    if (rule.requires_auto_rebook && !prefs.isAutoRebookEnabled) {
      status = 'blocked';
      reason = 'Auto-rebook is disabled by user preference';
    }

    if (rule.requires_credit_protection && !prefs.isCreditProtectionEnabled) {
      status = 'blocked';
      reason = 'Credit protection is disabled by user preference';
    }

    const priority =
      rule.allowed_action === 'auto_rebook' ? 3 :
      rule.allowed_action === 'protect_credit' ? 2 : 1;

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      actionType: rule.allowed_action,
      status,
      reason,
      priority,
    });
  }

  return results.sort((a, b) => b.priority - a.priority);
}
