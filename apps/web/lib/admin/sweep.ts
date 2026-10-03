import 'server-only';
import { start } from 'workflow/api';
import { selectAll } from '@/lib/retention';
import { createAdminClient } from '@/lib/supabase/admin';
import { incidentWorkflow } from '@/workflows/incident';
import { intakeWorkflow } from '@/workflows/intake';

type Admin = ReturnType<typeof createAdminClient>;

/** Work that was due to start more than this long ago and never did. */
export const SWEEP_AFTER_MS = 60 * 60 * 1000;

const cutoff = (now: Date) => new Date(now.getTime() - SWEEP_AFTER_MS).toISOString();

export interface StuckIncident {
  id: string;
  trip_id: string;
  event_type: string;
  status: string;
  detected_at: string;
}

export interface StuckMessage {
  id: string;
  trip_id: string;
  sender: string | null;
  subject: string | null;
  received_at: string;
}

/**
 * Open incidents detected over an hour ago whose group was never told: their workflow never started or died early.
 * A run that is genuinely still working (waiting on a planner's answer) is picked too; its run token makes the new
 * run exit at once, so starting it is harmless. `id` narrows to one incident, for the manual button.
 */
export async function stuckIncidents(admin: Admin, now: Date = new Date(), id?: string): Promise<StuckIncident[]> {
  const rows = await selectAll<StuckIncident & { incident_events: { kind: string }[] | null }>((from, to) => {
    let query = admin
      .from('incidents')
      .select('id, trip_id, event_type, status, detected_at, incident_events(kind)')
      .neq('status', 'resolved')
      .lt('detected_at', cutoff(now));
    if (id) query = query.eq('id', id);
    return query.order('id').range(from, to);
  });
  return rows
    .filter((incident) => !(incident.incident_events ?? []).some((event) => event.kind === 'notified'))
    .map(({ incident_events: _events, ...incident }) => incident);
}

/** Forwarded mail received over an hour ago that no intake run ever claimed. Quarantined mail waits for approval instead. */
export async function stuckMessages(admin: Admin, now: Date = new Date(), id?: string): Promise<StuckMessage[]> {
  return selectAll<StuckMessage>((from, to) => {
    let query = admin
      .from('inbound_messages')
      .select('id, trip_id, sender, subject, received_at')
      .eq('status', 'received')
      .is('claimed_by', null)
      .lt('received_at', cutoff(now));
    if (id) query = query.eq('id', id);
    return query.order('id').range(from, to);
  });
}

export interface SweepResult {
  incidents: { started: number; failed: string[] };
  messages: { started: number; failed: string[] };
}

/** Each start is isolated: one that throws is recorded and the sweep goes on. Intake's claim and the incident run token make repeats harmless. */
export async function sweepStuckWork(now: Date = new Date()): Promise<SweepResult> {
  const admin = createAdminClient();
  const [incidents, messages] = await Promise.all([stuckIncidents(admin, now), stuckMessages(admin, now)]);
  const result: SweepResult = { incidents: { started: 0, failed: [] }, messages: { started: 0, failed: [] } };
  for (const incident of incidents) {
    try {
      await start(incidentWorkflow, [incident.id]);
      result.incidents.started += 1;
    } catch (error) {
      console.error('sweep could not start the incident run', incident.id, error instanceof Error ? error.message : 'unknown');
      result.incidents.failed.push(incident.id);
    }
  }
  for (const message of messages) {
    try {
      await start(intakeWorkflow, [message.id]);
      result.messages.started += 1;
    } catch (error) {
      console.error('sweep could not start intake', message.id, error instanceof Error ? error.message : 'unknown');
      result.messages.failed.push(message.id);
    }
  }
  return result;
}
