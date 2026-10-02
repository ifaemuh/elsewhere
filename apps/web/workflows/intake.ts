import { FatalError, getWorkflowMetadata } from 'workflow';
import { start } from 'workflow/api';
import { runIntake } from '../lib/intake/orchestrate';
import type { ExtractOutcome, FailureKind, IntakeResult, PersistOutcome, ReadyExtraction } from '../lib/intake/process';
import { segmentMonitorWorkflow } from './segment-monitor';

export async function intakeWorkflow(messageId: string) {
  'use workflow';
  const result = await runIntake(messageId, { claim: claimStep, extract: extractStep, persist: persistStep, confirm: confirmStep, markFailed: markFailedStep });
  if ('monitorSegmentIds' in result) {
    for (const segmentId of result.monitorSegmentIds) await start(segmentMonitorWorkflow, [segmentId]);
  }
  return result;
}

/** Failures retrying cannot fix become FatalError; the rest (Resend 5xx, storage, database) keep the default retries. */
async function fatalIfPermanent<T>(run: () => Promise<T>): Promise<T> {
  const { PermanentIntakeError } = await import('../lib/intake/process');
  const { ConfigError } = await import('../lib/env');
  try {
    return await run();
  } catch (error) {
    if (error instanceof PermanentIntakeError || error instanceof ConfigError) throw new FatalError(error.message);
    throw error;
  }
}

async function liveDeps() {
  return (await import('../lib/intake/live-deps')).liveIntakeDeps();
}

// Step 0 takes the message; a second run for the same message finds it taken and exits.
async function claimStep(messageId: string): Promise<boolean> {
  'use step';
  return (await import('../lib/intake/process')).claimPhase(messageId, getWorkflowMetadata().workflowRunId, await liveDeps());
}

// Step A fetches, archives and reads the message; its small result is all later steps see.
async function extractStep(messageId: string): Promise<ExtractOutcome> {
  'use step';
  return fatalIfPermanent(async () => (await import('../lib/intake/process')).extractPhase(messageId, await liveDeps()));
}

// Step B writes bookings; every write is idempotent, so a retry completes it without duplicating.
async function persistStep(extraction: ReadyExtraction): Promise<PersistOutcome> {
  'use step';
  return fatalIfPermanent(async () => (await import('../lib/intake/process')).persistPhase(extraction, await liveDeps()));
}

// Step C looks up flights and marks the message done; a retry redoes only the segments still unresolved.
async function confirmStep(extraction: ReadyExtraction, persisted: PersistOutcome): Promise<IntakeResult> {
  'use step';
  return fatalIfPermanent(async () => (await import('../lib/intake/process')).confirmPhase(extraction, persisted, await liveDeps()));
}

async function markFailedStep(messageId: string, reason: string, problems: string[], kind: FailureKind, storagePath: string | null): Promise<IntakeResult> {
  'use step';
  return (await import('../lib/intake/process')).failPhase(messageId, reason, problems, await liveDeps(), { kind, storagePath });
}
