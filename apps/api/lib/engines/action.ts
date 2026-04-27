import { SupabaseClient } from '@supabase/supabase-js';
import type { PolicyActionType } from '@elsewhere/shared';

export interface ActionExecutionResult {
  success: boolean;
  actionType: PolicyActionType;
  detail: string;
}

export async function executeAssistAction(
  supabase: SupabaseClient,
  incidentId: string,
  actionType: PolicyActionType,
  eventDescription: string,
): Promise<ActionExecutionResult> {
  // In production, these would call real provider APIs
  let detail: string;

  switch (actionType) {
    case 'auto_rebook': {
      // Simulate rebooking with provider
      detail = `Automatically rebooked: ${eventDescription}. New confirmation pending.`;
      break;
    }
    case 'protect_credit': {
      // Simulate credit protection request
      detail = `Credit protection activated: ${eventDescription}. Provider credit secured.`;
      break;
    }
    case 'escalate': {
      // Create escalation record
      detail = `Escalated to support team: ${eventDescription}. Agent will contact within 30 minutes.`;
      break;
    }
    default:
      detail = `Unknown action type: ${actionType}`;
  }

  // Record the action in timeline
  await supabase.from('assist_timeline').insert({
    incident_id: incidentId,
    entry_type: 'executed_action',
    title: `Action executed: ${actionType.replace('_', ' ')}`,
    detail,
  });

  // Update incident resolution state
  const newState = actionType === 'escalate' ? 'escalation_prepared' : 'auto_resolved';
  await supabase
    .from('assist_incidents')
    .update({
      resolution_state: newState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', incidentId);

  return { success: true, actionType, detail };
}
