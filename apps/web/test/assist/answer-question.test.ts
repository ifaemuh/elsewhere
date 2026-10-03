import { beforeEach, describe, expect, it, vi } from 'vitest';

const TRIP = '11111111-1111-4111-8111-111111111111';
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const INCIDENT = '33333333-3333-4333-8333-333333333333';

const resumeHook = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
const revalidatePath = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn(async (_next: string) => ({ id: 'user-1' })));
vi.mock('workflow/api', () => ({ resumeHook }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/auth/user', () => ({ requireUser }));

const db: { isPlanner: boolean | null; incident: { pending_question: unknown } | null; incidentTrip: string; filters: [string, unknown][]; rpcArgs: unknown[] } = { isPlanner: true, incident: null, incidentTrip: TRIP, filters: [], rpcArgs: [] };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => (db.rpcArgs.push([name, args]), { data: db.isPlanner, error: null }),
    from: () => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (column: string, value: unknown) => (db.filters.push([column, value]), q),
        // The incident is on db.incidentTrip: a lookup that names another trip finds nothing.
        maybeSingle: async () => ({ data: db.filters.some(([c, v]) => c === 'trip_id' && v !== db.incidentTrip) ? null : db.incident, error: null }),
      });
      return q;
    },
  }),
}));

import { answerQuestion } from '@/app/trips/[id]/incidents/[incidentId]/actions';

const pending = { pending_question: { fact: 'passenger.accepted_alternative', prompt: 'Did anyone accept?', options: [] } };

beforeEach(() => {
  Object.assign(db, { isPlanner: true, incident: pending, incidentTrip: TRIP, filters: [], rpcArgs: [] });
  resumeHook.mockReset().mockResolvedValue(undefined);
  revalidatePath.mockClear();
  requireUser.mockClear();
});

describe('answerQuestion', () => {
  it('resumes the run with the planner’s answer', async () => {
    expect(await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'false')).toEqual({ error: null });
    expect(resumeHook).toHaveBeenCalledWith(`incident-answer:${INCIDENT}`, { fact: 'passenger.accepted_alternative', value: 'false' });
    expect(db.rpcArgs).toEqual([['is_trip_planner', { p_trip_id: TRIP }]]);
    expect(db.filters).toEqual(expect.arrayContaining([['id', INCIDENT], ['trip_id', TRIP]]));
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP}/incidents/${INCIDENT}`);
  });

  it('takes the “some of us did, some didn’t” answer', async () => {
    expect(await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'mixed')).toEqual({ error: null });
    expect(resumeHook).toHaveBeenCalledWith(expect.any(String), { fact: 'passenger.accepted_alternative', value: 'mixed' });
  });

  it('refuses anyone who is not the planner, before touching the incident or the run', async () => {
    db.isPlanner = false;
    expect(await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'false')).toEqual({ error: 'Only the planner can answer this.' });
    db.isPlanner = null;
    expect(await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'false')).toEqual({ error: 'Only the planner can answer this.' });
    expect(db.filters).toEqual([]);
    expect(resumeHook).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses an incident that belongs to another trip, even for the planner of the trip named', async () => {
    // The caller plans TRIP, but the incident they name is on OTHER_TRIP.
    db.incidentTrip = OTHER_TRIP;
    expect(await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'false')).toEqual({ error: 'We could not find that incident.' });
    expect(db.filters).toEqual(expect.arrayContaining([['trip_id', TRIP]]));
    expect(resumeHook).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a fact that is not the open question, or when no question is open', async () => {
    expect(await answerQuestion(TRIP, INCIDENT, 'event.cause', 'unknown')).toEqual({ error: 'That question is no longer open.' });
    db.incident = { pending_question: null };
    expect(await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'false')).toEqual({ error: 'That question is no longer open.' });
    expect(resumeHook).not.toHaveBeenCalled();
  });

  it('returns the error for a value the question does not offer, and for a fact we never ask about', async () => {
    const off = await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'maybe');
    expect(off.error).toMatch(/not an option/);
    db.incident = { pending_question: { fact: 'trip.booked_via' } };
    const unasked = await answerQuestion(TRIP, INCIDENT, 'trip.booked_via', 'ota');
    expect(unasked.error).toMatch(/not a question we ask/);
    expect(resumeHook).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses ids that are not uuids without reading anything', async () => {
    expect(await answerQuestion('not-a-uuid', INCIDENT, 'passenger.accepted_alternative', 'false')).toEqual({ error: 'We could not find that incident.' });
    expect(await answerQuestion(TRIP, "x'; drop table incidents;--", 'passenger.accepted_alternative', 'false')).toEqual({ error: 'We could not find that incident.' });
    expect(db.rpcArgs).toEqual([]);
    expect(resumeHook).not.toHaveBeenCalled();
  });

  it('says the question is closed when the run is no longer waiting', async () => {
    resumeHook.mockRejectedValue(new Error('no hook'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await answerQuestion(TRIP, INCIDENT, 'passenger.accepted_alternative', 'false')).toEqual({ error: 'That question is no longer open.' });
    } finally {
      error.mockRestore();
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
