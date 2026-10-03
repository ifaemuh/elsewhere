import { FatalError, createHook, sleep } from 'workflow';
import type { PlannerAnswer, PlannerQuestion } from '@/lib/assist/questions';
import { workflowPorts, type WorkflowPorts } from '@/lib/workflows/ports';
import { incidentAnswerToken, incidentReleaseToken, incidentRunToken } from '@/lib/workflows/tokens';

export async function incidentWorkflow(incidentId: string) {
  'use workflow';
  // The segment monitor restarts every incident that was never notified. The token makes those restarts
  // harmless: while a run handles this incident, another one exits at once.
  const claim = createHook({ token: incidentRunToken(incidentId) });
  if (await claim.getConflict()) return { incidentId, status: 'duplicate' as const, playbookId: null };

  try {
    // A run that starts after an earlier one finished (the alert route and a poll both report an incident
    // that was already recorded) finds the group already told, and sends nothing.
    if (await notifiedStep(incidentId)) return { incidentId, status: 'duplicate' as const, playbookId: null };

    // Before anything is known to apply: tell the people on the booking what happened, and that a plan follows.
    await alertStep(incidentId);

    const { question } = await assessStep(incidentId);
    if (question) {
      // The hook exists before the planner is asked, so an answer that arrives right after the text still gets through.
      const hook = createHook<PlannerAnswer>({ token: incidentAnswerToken(incidentId) });
      await askStep(incidentId, question);
      const answer = await Promise.race([hook.then((a) => a), sleep('6h').then(() => null)]);
      hook.dispose();
      await answerStep(incidentId, answer);
    }

    const { playbookId, held } = await playbookStep(incidentId);

    if (held) {
      // Hand-run trip: the founder reviews first. The playbook stays hidden (RLS) until it is released.
      await requestReviewStep(incidentId);
      const release = createHook<{ releasedBy: string }>({ token: incidentReleaseToken(incidentId) });
      await Promise.race([release.then(() => true), sleep('2h').then(() => false)]);
      release.dispose();
      await releaseStep(incidentId);
    }

    await notifyStep(incidentId);
    return { incidentId, status: 'notified' as const, playbookId };
  } finally {
    claim.dispose();
  }
}

/** A missing setting cannot be fixed by retrying, so it becomes a FatalError; everything else keeps the default retries. */
async function withPorts<T>(run: (ports: WorkflowPorts) => Promise<T>): Promise<T> {
  const { ConfigError } = await import('@/lib/env');
  try {
    return await run(await workflowPorts());
  } catch (error) {
    if (error instanceof ConfigError) throw new FatalError(error.message);
    throw error;
  }
}

async function notifiedStep(incidentId: string) {
  'use step';
  return withPorts((ports) => ports.isNotified(incidentId));
}

async function alertStep(incidentId: string) {
  'use step';
  await withPorts((ports) => ports.alertAffected(incidentId));
}

async function assessStep(incidentId: string) {
  'use step';
  return withPorts((ports) => ports.assessIncident(incidentId));
}

async function askStep(incidentId: string, question: PlannerQuestion) {
  'use step';
  await withPorts((ports) => ports.askPlanner(incidentId, question));
}

async function answerStep(incidentId: string, answer: PlannerAnswer | null) {
  'use step';
  await withPorts((ports) => ports.recordAnswer(incidentId, answer));
}

async function playbookStep(incidentId: string) {
  'use step';
  return withPorts((ports) => ports.generatePlaybook(incidentId));
}

async function requestReviewStep(incidentId: string) {
  'use step';
  await withPorts((ports) => ports.requestReview(incidentId));
}

async function releaseStep(incidentId: string) {
  'use step';
  await withPorts((ports) => ports.releaseHeldPlaybooks(incidentId));
}

async function notifyStep(incidentId: string) {
  'use step';
  await withPorts((ports) => ports.notifyAffected(incidentId));
}
