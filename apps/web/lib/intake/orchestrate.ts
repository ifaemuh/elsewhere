import type { ExtractOutcome, FailureKind, IntakeResult, PersistOutcome, ReadyExtraction } from './process';

/** The workflow's steps, injected so the control flow is testable and the workflow body stays deterministic. */
export interface IntakeSteps {
  extract(messageId: string): Promise<ExtractOutcome>;
  persist(extraction: ReadyExtraction): Promise<PersistOutcome>;
  confirm(extraction: ReadyExtraction, persisted: PersistOutcome): Promise<IntakeResult>;
  markFailed(messageId: string, reason: string, problems: string[], kind: FailureKind, storagePath: string | null): Promise<IntakeResult>;
}

/** A step that threw FatalError (fixed text) or ran out of retries (anything else, which may carry provider detail). */
function reasonFor(error: unknown): string {
  return error instanceof Error && (error.name === 'FatalError' || (error as { fatal?: boolean }).fatal === true)
    ? error.message
    : 'processing did not finish';
}

/**
 * Extract, persist, confirm. Each is its own step, and a step's result is replayed from the event log, so
 * a retry of a later step never reruns the paid extraction. Whatever still fails after retries ends as a
 * failed message with a planner-facing item, never a message stuck in "received".
 */
export async function runIntake(messageId: string, steps: IntakeSteps): Promise<IntakeResult> {
  let extraction: ReadyExtraction | null = null;
  let stage: FailureKind = 'unreadable';
  try {
    const extracted = await steps.extract(messageId);
    if (extracted.status === 'missing') return extracted;
    extraction = extracted;
    if (extraction.bookings.length === 0) {
      return await steps.markFailed(messageId, 'no booking found', extraction.problems, 'unreadable', extraction.storagePath);
    }
    stage = 'save';
    const persisted = await steps.persist(extraction);
    stage = 'lookup';
    return await steps.confirm(extraction, persisted);
  } catch (error) {
    const reason = stage === 'lookup' ? 'flight lookup did not finish' : reasonFor(error);
    return steps.markFailed(messageId, reason, extraction?.problems ?? [], stage, extraction?.storagePath ?? null);
  }
}
