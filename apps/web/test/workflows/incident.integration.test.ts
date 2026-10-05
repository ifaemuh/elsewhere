import { getRun, resumeHook, start } from 'workflow/api';
import { waitForHook, waitForSleep } from '@workflow/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryState, resetMemoryPorts } from '@/lib/workflows/memory-ports';
import { incidentAnswerToken, incidentReleaseToken } from '@/lib/workflows/tokens';
import { incidentWorkflow } from '@/workflows/incident';

beforeEach(() => resetMemoryPorts());

describe('incidentWorkflow', () => {
  it('runs the whole flow in order: heads-up, question, answer, playbook, plan ready', async () => {
    const state = memoryState();
    state.questions.set('inc-8', { fact: 'event.cause', prompt: 'Why?', options: [] });
    const run = await start(incidentWorkflow, ['inc-8']);
    await waitForHook(run, { token: incidentAnswerToken('inc-8') });
    // The heads-up is out, and the question is asked after it; nothing else has happened yet.
    // (The answer hook exists before the question goes out, so wait for the ask step itself.)
    await vi.waitFor(() => expect(state.calls).toEqual(['alert:inc-8', 'ask:inc-8']));
    expect(state.alerted).toEqual(['inc-8']);
    expect(state.notified).toEqual([]);
    await resumeHook(incidentAnswerToken('inc-8'), { fact: 'event.cause', value: 'unknown' });
    expect(await run.returnValue).toEqual({ incidentId: 'inc-8', status: 'notified', playbookId: 'pb-inc-8' });
    expect(state.answers.get('inc-8')).toEqual({ fact: 'event.cause', value: 'unknown' });
    expect(state.notified).toEqual(['inc-8']);
    expect(state.alerted).toEqual(['inc-8']);
  });

  it('sends the heads-up at once on a hand-run trip, while the playbook waits for review', async () => {
    const state = memoryState();
    state.reviewed.add('inc-9');
    const run = await start(incidentWorkflow, ['inc-9']);
    await waitForHook(run, { token: incidentReleaseToken('inc-9') });
    expect(state.alerted).toEqual(['inc-9']);
    expect(state.notified).toEqual([]);
    expect(state.released).toEqual([]);
    await resumeHook(incidentReleaseToken('inc-9'), { releasedBy: 'founder' });
    await run.returnValue;
    expect(state.notified).toEqual(['inc-9']);
  });

  it('sends no second heads-up when a finished incident is started again', async () => {
    const state = memoryState();
    await (await start(incidentWorkflow, ['inc-10'])).returnValue;
    await (await start(incidentWorkflow, ['inc-10'])).returnValue;
    expect(state.calls.filter((c) => c === 'alert:inc-10')).toHaveLength(1);
  });

  it('asks the planner, waits for the answer, drafts the playbook, and notifies', async () => {
    const state = memoryState();
    state.questions.set('inc-1', { fact: 'passenger.accepted_alternative', prompt: 'Did anyone accept?', options: [] });
    const run = await start(incidentWorkflow, ['inc-1']);
    await waitForHook(run, { token: incidentAnswerToken('inc-1') });
    await resumeHook(incidentAnswerToken('inc-1'), { fact: 'passenger.accepted_alternative', value: 'false' });
    expect(await run.returnValue).toEqual({ incidentId: 'inc-1', status: 'notified', playbookId: 'pb-inc-1' });
    expect(state.answers.get('inc-1')).toEqual({ fact: 'passenger.accepted_alternative', value: 'false' });
    expect(state.notified).toEqual(['inc-1']);
  });

  it('takes an answer that arrives the moment the planner is asked', async () => {
    const state = memoryState();
    state.questions.set('inc-7', { fact: 'event.cause', prompt: 'Why?', options: [] });
    state.answerOnAsk.set('inc-7', { fact: 'event.cause', value: 'unknown' });
    const run = await start(incidentWorkflow, ['inc-7']);
    expect(await run.returnValue).toMatchObject({ status: 'notified' });
    expect(state.answers.get('inc-7')).toEqual({ fact: 'event.cause', value: 'unknown' });
  });

  it('drafts without an answer after six hours', async () => {
    const state = memoryState();
    state.questions.set('inc-2', { fact: 'event.cause', prompt: 'Why?', options: [] });
    const run = await start(incidentWorkflow, ['inc-2']);
    const sleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    await run.returnValue;
    expect(state.answers.get('inc-2')).toBeNull();
    expect(state.notified).toEqual(['inc-2']);
  });

  it('asks nothing when no question decides the incident', async () => {
    const state = memoryState();
    const run = await start(incidentWorkflow, ['inc-0']);
    expect(await run.returnValue).toEqual({ incidentId: 'inc-0', status: 'notified', playbookId: 'pb-inc-0' });
    expect(state.calls).not.toContain('ask:inc-0');
    expect(state.reviewRequested).toEqual([]);
    expect(state.notified).toEqual(['inc-0']);
  });

  it('holds a hand-run trip’s playbook for review until released', async () => {
    const state = memoryState();
    state.reviewed.add('inc-3');
    const run = await start(incidentWorkflow, ['inc-3']);
    await waitForHook(run, { token: incidentReleaseToken('inc-3') });
    expect(state.reviewRequested).toEqual(['inc-3']);
    expect(state.released).toEqual([]);
    expect(state.notified).toEqual([]);
    await resumeHook(incidentReleaseToken('inc-3'), { releasedBy: 'founder' });
    await run.returnValue;
    expect(state.released).toEqual(['inc-3']);
    expect(state.notified).toEqual(['inc-3']);
  });

  it('releases a held playbook and notifies when the founder does not answer within two hours', async () => {
    const state = memoryState();
    state.reviewed.add('inc-6');
    const run = await start(incidentWorkflow, ['inc-6']);
    await waitForHook(run, { token: incidentReleaseToken('inc-6') });
    const sleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    await run.returnValue;
    expect(state.released).toEqual(['inc-6']);
    expect(state.notified).toEqual(['inc-6']);
  });

  it('exits when another run already handles the incident', async () => {
    const state = memoryState();
    state.questions.set('inc-4', { fact: 'event.cause', prompt: 'Why?', options: [] });
    const first = await start(incidentWorkflow, ['inc-4']);
    await waitForHook(first, { token: incidentAnswerToken('inc-4') });
    const second = await start(incidentWorkflow, ['inc-4']);
    expect(await second.returnValue).toEqual({ incidentId: 'inc-4', status: 'duplicate', playbookId: null });
    expect(state.calls.filter((call) => call === 'ask:inc-4')).toHaveLength(1);
    await getRun(first.runId).cancel();
  });

  it('sends nothing when a finished, notified incident is started again', async () => {
    const state = memoryState();
    const first = await start(incidentWorkflow, ['inc-5']);
    expect(await first.returnValue).toMatchObject({ status: 'notified' });
    expect(state.notified).toEqual(['inc-5']);

    // The alert route and a later poll can both report an incident that was already recorded.
    const again = await start(incidentWorkflow, ['inc-5']);
    expect(await again.returnValue).toEqual({ incidentId: 'inc-5', status: 'duplicate', playbookId: null });
    expect(state.notified).toEqual(['inc-5']);
    expect(state.calls.filter((call) => call === 'ask:inc-5')).toHaveLength(0);
  });
});
