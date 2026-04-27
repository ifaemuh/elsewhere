import { NextRequest, NextResponse } from 'next/server';
import { isLocalDev } from '@lib/storage';
import { createAdminClient } from '@lib/supabase/admin';
import { evaluatePolicies } from '@lib/engines/policy';
import { executeAssistAction } from '@lib/engines/action';
import { getFeatureFlags } from '@lib/utils/feature-flags';
import type { DisruptionSource, DisruptionKind, DisruptionSeverity } from '@elsewhere/shared';

interface AssistWebhookPayload {
  tripId: string;
  source: DisruptionSource;
  kind: DisruptionKind;
  severity: DisruptionSeverity;
  description: string;
  referenceCode: string;
  occurredAt: string;
}

export async function POST(req: NextRequest) {
  if (isLocalDev()) {
    return NextResponse.json({ status: 'skipped', message: 'Webhooks disabled in local dev' });
  }

  // Verify webhook secret
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.ASSIST_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid webhook secret', statusCode: 401 },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const payload = (await req.json()) as AssistWebhookPayload;
  const flags = getFeatureFlags();

  // Step 1: Ingest the disruption event
  const { data: event, error: eventError } = await supabase
    .from('assist_disruption_events')
    .insert({
      trip_id: payload.tripId,
      source: payload.source,
      kind: payload.kind,
      severity: payload.severity,
      description: payload.description,
      reference_code: payload.referenceCode,
      occurred_at: payload.occurredAt,
    })
    .select('id')
    .single();

  if (eventError || !event) {
    return NextResponse.json(
      { error: 'Failed to ingest event', message: eventError?.message ?? 'Unknown', statusCode: 500 },
      { status: 500 },
    );
  }

  // Step 2: Create incident
  const { data: incident, error: incidentError } = await supabase
    .from('assist_incidents')
    .insert({
      trip_id: payload.tripId,
      event_id: event.id,
      title: `${payload.source} ${payload.kind}: ${payload.referenceCode}`,
      detail: payload.description,
      severity: payload.severity,
      resolution_state: 'monitoring',
    })
    .select('id')
    .single();

  if (incidentError || !incident) {
    return NextResponse.json(
      { error: 'Failed to create incident', message: incidentError?.message ?? 'Unknown', statusCode: 500 },
      { status: 500 },
    );
  }

  // Timeline: event ingested
  await supabase.from('assist_timeline').insert({
    incident_id: incident.id,
    entry_type: 'ingested_event',
    title: `Disruption detected: ${payload.source} ${payload.kind}`,
    detail: `${payload.description} (${payload.severity} severity, ref: ${payload.referenceCode})`,
  });

  // Step 3: Evaluate policies
  const recommendations = await evaluatePolicies(supabase, {
    id: event.id,
    source: payload.source,
    kind: payload.kind,
    severity: payload.severity,
    tripId: payload.tripId,
  });

  // Store recommendations
  for (const rec of recommendations) {
    await supabase.from('assist_action_recommendations').insert({
      incident_id: incident.id,
      event_id: event.id,
      action_type: rec.actionType,
      status: rec.status,
      reason: rec.reason,
      priority: rec.priority,
    });

    // Timeline: policy evaluated
    await supabase.from('assist_timeline').insert({
      incident_id: incident.id,
      entry_type: 'evaluated_policy',
      title: `Policy evaluated: ${rec.ruleName}`,
      detail: `${rec.actionType} — ${rec.status}: ${rec.reason}`,
    });
  }

  // Step 4: Auto-execute allowed actions if feature flag enabled
  const executedActions: string[] = [];
  if (flags.enableAssistAutoExecution) {
    const allowed = recommendations.filter((r) => r.status === 'allowed');

    for (const rec of allowed) {
      const result = await executeAssistAction(
        supabase,
        incident.id,
        rec.actionType,
        payload.description,
      );
      if (result.success) {
        executedActions.push(rec.actionType);
      }
    }
  }

  return NextResponse.json({
    status: 'processed',
    eventId: event.id,
    incidentId: incident.id,
    recommendations: recommendations.length,
    executedActions,
  });
}
