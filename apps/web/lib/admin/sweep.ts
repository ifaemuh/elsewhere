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

export interface StuckIncidentOptions {
  /** Only incidents detected within this many days. The cron uses it; /admin lists everything. */
  sinceDays?: number;
  /** Leave out incidents that are waiting rather than stuck: awaiting the planner's answer, or holding a playbook for review. */
  excludeWaiting?: boolean;
}

/**
 * Open incidents detected over an hour ago whose group was never told: their workflow never started or died early.
 * A run that is genuinely still working (waiting on a planner's answer) is picked too unless `excludeWaiting`; its run
 * token makes a new run exit at once, so starting it is harmless. `id` narrows to one incident, for the manual button.
 */
export async function stuckIncidents(admin: Admin, now: Date = new Date(), id?: string, options: StuckIncidentOptions = {}): Promise<StuckIncident[]> {
  const rows = await selectAll<StuckIncident & { incident_events: { kind: string }[] | null; playbooks: { held_for_review: boolean }[] | null }>((from, to) => {
    let query = admin
      .from('incidents')
      .select('id, trip_id, event_type, status, detected_at, incident_events(kind), playbooks(held_for_review)')
      .neq('status', 'resolved')
      .lt('detected_at', cutoff(now));
    if (id) query = query.eq('id', id);
    if (options.sinceDays) query = query.gte('detected_at', new Date(now.getTime() - options.sinceDays * 24 * 3600_000).toISOString());
    if (options.excludeWaiting) query = query.neq('status', 'needs_answer');
    return query.order('id').range(from, to);
  });
  return rows
    .filter((incident) => !(incident.incident_events ?? []).some((event) => event.kind === 'notified'))
    .filter((incident) => !options.excludeWaiting || !(incident.playbooks ?? []).some((playbook) => playbook.held_for_review))
    .map(({ incident_events: _events, playbooks: _playbooks, ...incident }) => incident);
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

/** One daily run starts at most this many of each kind, oldest first; the rest wait for the next run (and /admin lists them). */
export const SWEEP_CAP = 25;
export const SWEEP_WINDOW_DAYS = 14;

export interface SweepKind {
  started: number;
  failed: string[];
  skipped: number;
}

export interface SweepResult {
  incidents: SweepKind;
  messages: SweepKind;
}

async function startEach(ids: string[], run: (id: string) => Promise<unknown>, label: string): Promise<SweepKind> {
  const result: SweepKind = { started: 0, failed: [], skipped: Math.max(0, ids.length - SWEEP_CAP) };
  for (const id of ids.slice(0, SWEEP_CAP)) {
    try {
      await run(id);
      result.started += 1;
    } catch (error) {
      console.error(`sweep could not start ${label}`, id, error instanceof Error ? error.message : 'unknown');
      result.failed.push(id);
    }
  }
  return result;
}

/** Each start is isolated: one that throws is recorded and the sweep goes on. Intake's claim and the incident run token make repeats harmless. */
export async function sweepStuckWork(now: Date = new Date()): Promise<SweepResult> {
  const admin = createAdminClient();
  const [incidents, messages] = await Promise.all([stuckIncidents(admin, now, undefined, { sinceDays: SWEEP_WINDOW_DAYS }), stuckMessages(admin, now)]);
  const oldestFirst = <T extends { id: string }>(rows: T[], at: (row: T) => string) => [...rows].sort((a, b) => at(a).localeCompare(at(b))).map((row) => row.id);
  return {
    incidents: await startEach(oldestFirst(incidents, (i) => i.detected_at), (id) => start(incidentWorkflow, [id]), 'the incident run'),
    messages: await startEach(oldestFirst(messages, (m) => m.received_at), (id) => start(intakeWorkflow, [id]), 'intake'),
  };
}
