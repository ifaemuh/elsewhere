'use server';

import { revalidatePath } from 'next/cache';
import { resumeHook, start } from 'workflow/api';
import { HookNotFoundError } from 'workflow/errors';
import { requireAdmin } from '@/lib/admin/guard';
import { SWEEP_AFTER_MS, stuckIncidents, stuckMessages } from '@/lib/admin/sweep';
import { checkCitations } from '@/lib/assist/citation-check';
import { assessIncident, notifyAffected, releaseHeldPlaybooks } from '@/lib/assist/incidents';
import { PlaybookSchema } from '@/lib/assist/playbook-schema';
import { runDocumentChecks } from '@/lib/documents/service';
import { approveQuarantined } from '@/lib/intake/quarantine';
import { createAdminClient } from '@/lib/supabase/admin';
import { incidentReleaseToken } from '@/lib/workflows/tokens';
import { wakeTripMonitor } from '@/lib/workflows/wake';
import { incidentWorkflow } from '@/workflows/incident';
import { intakeWorkflow } from '@/workflows/intake';
import { tripMonitorWorkflow } from '@/workflows/trip-monitor';

/**
 * start() returns at once, and a run that finds the trip already monitored exits as a duplicate inside itself. So the
 * live monitor is woken too: it re-fans-out the segments that have no monitor and re-reads the trip's timing.
 */
async function startAndWake(tripId: string): Promise<void> {
  await start(tripMonitorWorkflow, [tripId]);
  await wakeTripMonitor(tripId);
}

/**
 * What a button gets back. Expected failures (a trip that already has a pass, a run that is not stuck any more) come
 * back as `error`, so the message reaches the founder in production, where a thrown error is reduced to a digest.
 * Unexpected failures still throw, to /admin's error page.
 */
export interface ActionResult {
  error: string | null;
}
const ok: ActionResult = { error: null };
const fail = (error: string): ActionResult => ({ error });

/**
 * A comped trip is hand-run: trips.hand_run makes its playbooks wait for review before anyone is notified. The comp_trip_pass
 * function marks the trip and writes the pass row in one transaction, and refuses a trip that already has a pass.
 */
export async function compPass(tripId: string): Promise<ActionResult> {
  const founder = await requireAdmin();
  const { data: comped, error } = await createAdminClient().rpc('comp_trip_pass', { p_trip_id: tripId, p_created_by: founder.id });
  if (error) return fail(`Could not comp the pass: ${error.message}`);
  if (comped !== true) return fail('This trip already has a pass.');
  revalidatePath('/admin');
  try {
    await startAndWake(tripId);
  } catch (e) {
    return fail(`The pass is comped, but monitoring did not start (${e instanceof Error ? e.message : 'unknown'}). Use Start monitoring.`);
  }
  return ok;
}

/** For a trip whose Stripe webhook could not start monitoring (Task 9). A second run exits, so repeating it is safe. */
export async function startMonitoring(tripId: string): Promise<ActionResult> {
  await requireAdmin();
  const { data: trip, error } = await createAdminClient().from('trips').select('pass_status').eq('id', tripId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!trip || trip.pass_status === 'none') return fail('Only a trip with a pass is monitored.');
  await startAndWake(tripId);
  revalidatePath('/admin');
  return ok;
}

export async function rerunChecks(tripId: string): Promise<ActionResult> {
  await requireAdmin();
  await runDocumentChecks(tripId);
  revalidatePath('/admin');
  return ok;
}

export async function adminApproveQuarantined(messageId: string): Promise<ActionResult> {
  await requireAdmin();
  // The same approval as the planner's feed button (Task 15), across every trip.
  if (await approveQuarantined(messageId, null)) await start(intakeWorkflow, [messageId]);
  revalidatePath('/admin');
  return ok;
}

/** Starts the run for an open incident whose workflow never started. A run already working it exits as a duplicate. */
export async function startIncidentRun(incidentId: string): Promise<ActionResult> {
  await requireAdmin();
  // Age is not required here (the cutoff is pushed back to now): the founder is choosing to start it. It must still be open and un-notified.
  const found = await stuckIncidents(createAdminClient(), new Date(Date.now() + SWEEP_AFTER_MS), incidentId);
  if (found.length === 0) return fail('That incident is resolved or the group was already told.');
  await start(incidentWorkflow, [incidentId]);
  revalidatePath('/admin');
  return ok;
}

/** Starts intake for a forwarded message nobody claimed. Intake's claim is idempotent. */
export async function startIntakeRun(messageId: string): Promise<ActionResult> {
  await requireAdmin();
  const found = await stuckMessages(createAdminClient(), new Date(Date.now() + SWEEP_AFTER_MS), messageId);
  if (found.length === 0) return fail('That message was already claimed or is not waiting.');
  await start(intakeWorkflow, [messageId]);
  revalidatePath('/admin');
  return ok;
}

export interface EditState {
  error: string | null;
  saved: boolean;
}

/** Saves an edited playbook as a new version, only if it still passes the citation check. */
export async function editPlaybook(incidentId: string, _prev: EditState, form: FormData): Promise<EditState> {
  const founder = await requireAdmin();
  let parsed;
  try {
    parsed = PlaybookSchema.safeParse(JSON.parse(String(form.get('playbook') ?? '')));
  } catch {
    return { error: 'That is not valid JSON.', saved: false };
  }
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), saved: false };
  const assessment = await assessIncident(incidentId);
  // Only verified rules may be cited, as when the playbook was generated.
  const applying = assessment.applying.filter((rule) => rule.status === 'verified');
  const issues = checkCitations(parsed.data, applying, assessment.extraNumbers);
  if (issues.length > 0) return { error: `Citation check failed: ${issues.map((i) => `${i.path} ${i.problem} ${i.detail}`).join('; ')}`, saved: false };

  const cited = new Set([...parsed.data.owed, ...parsed.data.steps, ...parsed.data.messages].flatMap((item) => item.rule_ids));
  const admin = createAdminClient();
  // An edit made during the review hold stays hidden with the rest until the release.
  const { data: latest, error: latestError } = await admin.from('playbooks').select('held_for_review').eq('incident_id', incidentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw new Error(latestError.message);
  const { data: playbook, error: insertError } = await admin
    .from('playbooks')
    .insert({
      incident_id: incidentId,
      content: parsed.data,
      rules_cited: applying.filter((r) => cited.has(r.id)).map((r) => ({ rule_id: r.id, rule_version: r.version })),
      model: 'founder-edit',
      citation_check_passed: true,
      held_for_review: latest?.held_for_review ?? false,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message);
  const { error: eventError } = await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'playbook_edited', actor_user_id: founder.id, detail: { playbook_id: playbook.id } });
  if (eventError) throw new Error(eventError.message);
  revalidatePath('/admin');
  return { error: null, saved: true };
}

export async function releasePlaybook(incidentId: string): Promise<ActionResult> {
  const founder = await requireAdmin();
  try {
    await resumeHook(incidentReleaseToken(incidentId), { releasedBy: founder.id });
  } catch (error) {
    if (!HookNotFoundError.is(error)) throw error;
    // No hook: either the two-hour hold ran out and the workflow released the playbook itself, or the run died while
    // it was held. In the second case the playbook is still hidden, so release and notify here. Both steps are
    // idempotent. A new incident run is never started: it would re-enter the hold.
    const { data: latest, error: readError } = await createAdminClient()
      .from('playbooks')
      .select('held_for_review')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (latest?.held_for_review === true) {
      await releaseHeldPlaybooks(incidentId);
      await notifyAffected(incidentId);
    } else {
      console.warn('no release hook for the incident, and nothing is held; the hold already ended', incidentId);
    }
  }
  revalidatePath('/admin');
  return ok;
}
