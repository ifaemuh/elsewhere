import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { code?: string; message: string } | null };
const TRIP = '11111111-1111-4111-8111-111111111111';
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const INCIDENT = '33333333-3333-4333-8333-333333333333';
const VOTE = '44444444-4444-4444-8444-444444444444';
const OPTION = '55555555-5555-4555-8555-555555555555';

const state = {
  userId: 'u-pat',
  isPlanner: true,
  isMember: true,
  incident: { id: INCIDENT, affected_user_ids: ['u-sam', 'u-pat'] } as unknown,
  openVote: null as unknown,
  voteInsert: { data: { id: VOTE }, error: null } as Result,
  optionsInsert: { error: null } as { error: { message: string } | null },
  vote: { id: VOTE } as unknown,
  option: { id: OPTION } as unknown,
  respondError: null as { code: string; message: string } | null,
  closeRows: [{ id: VOTE }] as unknown[],
  members: [{ user_id: 'u-pat' }, { user_id: 'u-sam' }, { user_id: 'u-lee' }],
};
const log: { table: string; op: string; row?: unknown; filters: [string, unknown][] }[] = [];
const rpc = vi.fn(async (name: string, _args?: unknown) => {
  if (name === 'is_trip_planner') return { data: state.isPlanner, error: null };
  if (name === 'is_trip_member') return { data: state.isMember, error: null };
  return { data: null, error: name === 'respond_vote' ? state.respondError : null };
});

function table(name: string) {
  const entry = { table: name, op: 'select', row: undefined as unknown, filters: [] as [string, unknown][] };
  log.push(entry);
  const resolve = (): Result => {
    if (entry.op === 'insert') return name === 'votes' ? state.voteInsert : { data: null, error: state.optionsInsert.error };
    if (entry.op === 'update') return { data: state.closeRows, error: null };
    if (name === 'incidents') return { data: state.incident, error: null };
    if (name === 'votes') {
      const wantsOpenForIncident = entry.filters.some(([c]) => c === 'incident_id');
      return { data: wantsOpenForIncident ? state.openVote : state.vote, error: null };
    }
    if (name === 'vote_options') return { data: state.option, error: null };
    if (name === 'trip_members') return { data: state.members, error: null };
    if (name === 'trips') return { data: { name: 'Lisbon' }, error: null };
    return { data: null, error: null };
  };
  const q: Record<string, unknown> = {};
  const chain = () => q;
  q.select = chain;
  q.insert = (row: unknown) => { entry.op = 'insert'; entry.row = row; return q; };
  q.update = (row: unknown) => { entry.op = 'update'; entry.row = row; return q; };
  q.eq = (c: string, v: unknown) => { entry.filters.push([c, v]); return q; };
  q.limit = chain;
  q.single = async () => resolve();
  q.maybeSingle = async () => resolve();
  q.then = (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, from: table }) }));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: state.userId }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
const queueNotifications = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
vi.mock('@/lib/notify/queue', () => ({ queueNotifications }));
vi.mock('@/lib/env', () => ({ appUrl: () => 'https://elsewhere.test' }));

import { closeVote, createVote, respondVote } from '@/app/trips/[id]/votes/actions';

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [k, v] of Object.entries({ title: 'Which flight?', options: 'Tomorrow 7:05\nTonight via Denver (availability not confirmed — ask the airline)', ...values })) data.set(k, v);
  return data;
}
const wrote = (t: string, op: string) => log.filter((l) => l.table === t && l.op === op);

beforeEach(() => {
  log.length = 0;
  rpc.mockClear();
  queueNotifications.mockClear();
  Object.assign(state, {
    userId: 'u-pat',
    isPlanner: true,
    isMember: true,
    incident: { id: INCIDENT, affected_user_ids: ['u-sam', 'u-pat'] },
    openVote: null,
    voteInsert: { data: { id: VOTE }, error: null },
    optionsInsert: { error: null },
    vote: { id: VOTE },
    option: { id: OPTION },
    respondError: null,
    closeRows: [{ id: VOTE }],
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createVote', () => {
  it('starts an incident vote for the affected travelers and notifies them but not the creator', async () => {
    await expect(createVote(TRIP, INCIDENT, { error: null }, form())).rejects.toThrow(`REDIRECT:/trips/${TRIP}/votes/${VOTE}`);
    const [insert] = wrote('votes', 'insert');
    expect(insert.row).toMatchObject({ trip_id: TRIP, incident_id: INCIDENT, required_user_ids: ['u-sam', 'u-pat'], created_by: 'u-pat' });
    expect(wrote('vote_options', 'insert')[0].row).toEqual([
      { vote_id: VOTE, label: 'Tomorrow 7:05', note: null, position: 1 },
      { vote_id: VOTE, label: 'Tonight via Denver', note: 'availability not confirmed — ask the airline', position: 2 },
    ]);
    expect(queueNotifications).toHaveBeenCalledOnce();
    expect(queueNotifications.mock.calls[0][0]).toMatchObject({ userIds: ['u-sam'], tripId: TRIP, template: 'vote', urgent: true, relatedEntityId: VOTE });
  });

  it('lets an affected non-planner start an incident vote', async () => {
    state.isPlanner = false;
    state.userId = 'u-sam';
    await expect(createVote(TRIP, INCIDENT, { error: null }, form())).rejects.toThrow(`REDIRECT:/trips/${TRIP}/votes/${VOTE}`);
    expect(wrote('votes', 'insert')[0].row).toMatchObject({ created_by: 'u-sam', required_user_ids: ['u-sam', 'u-pat'] });
    expect(queueNotifications.mock.calls[0][0]).toMatchObject({ userIds: ['u-pat'] });
  });

  it('refuses an unaffected member for an incident vote, with no write and no notification', async () => {
    state.isPlanner = false;
    state.userId = 'u-lee';
    expect((await createVote(TRIP, INCIDENT, { error: null }, form())).error).toMatch(/Only the planner or a traveler/);
    expect(wrote('votes', 'insert')).toHaveLength(0);
    expect(wrote('vote_options', 'insert')).toHaveLength(0);
    expect(queueNotifications).not.toHaveBeenCalled();
  });

  it('lets any member start a trip-level vote, and refuses a non-member', async () => {
    state.isPlanner = false;
    state.userId = 'u-lee';
    await expect(createVote(TRIP, null, { error: null }, form())).rejects.toThrow('REDIRECT');
    expect(wrote('votes', 'insert')).toHaveLength(1);
    log.length = 0;
    state.isMember = false;
    expect((await createVote(TRIP, null, { error: null }, form())).error).toBe('Only people on this trip can start a vote.');
    expect(log).toHaveLength(0);
  });

  it('refuses an incident that is not on this trip', async () => {
    state.incident = null;
    expect(await createVote(OTHER_TRIP, INCIDENT, { error: null }, form())).toEqual({ error: 'That alert is not on this trip.' });
    expect(log.find((l) => l.table === 'incidents')!.filters).toContainEqual(['trip_id', OTHER_TRIP]);
    expect(wrote('votes', 'insert')).toHaveLength(0);
    expect(queueNotifications).not.toHaveBeenCalled();
  });

  it('a double submit lands on the open vote without a second vote or notification', async () => {
    state.openVote = { id: VOTE };
    await expect(createVote(TRIP, INCIDENT, { error: null }, form())).rejects.toThrow(`REDIRECT:/trips/${TRIP}/votes/${VOTE}`);
    expect(wrote('votes', 'insert')).toHaveLength(0);
    expect(queueNotifications).not.toHaveBeenCalled();
  });

  it('a racing submit that loses on the unique index lands on the winner, with no notification', async () => {
    state.voteInsert = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "votes_one_open_per_incident"' } };
    // The first open-vote lookup (before the insert) finds nothing; the one after the conflict finds the winner.
    let lookups = 0;
    Object.defineProperty(state, 'openVote', { configurable: true, get: () => (++lookups > 1 ? { id: VOTE } : null), set: () => undefined });
    await expect(createVote(TRIP, INCIDENT, { error: null }, form())).rejects.toThrow(`REDIRECT:/trips/${TRIP}/votes/${VOTE}`);
    expect(wrote('vote_options', 'insert')).toHaveLength(0);
    expect(queueNotifications).not.toHaveBeenCalled();
    Object.defineProperty(state, 'openVote', { configurable: true, writable: true, value: null });
  });

  it('asks everyone on the trip when the vote is not about an incident', async () => {
    await expect(createVote(TRIP, null, { error: null }, form())).rejects.toThrow('REDIRECT');
    expect(wrote('votes', 'insert')[0].row).toMatchObject({ incident_id: null, required_user_ids: ['u-pat', 'u-sam', 'u-lee'] });
    expect(queueNotifications.mock.calls[0][0]).toMatchObject({ userIds: ['u-sam', 'u-lee'], urgent: false });
  });

  it('needs a question and two options', async () => {
    expect((await createVote(TRIP, null, { error: null }, form({ options: 'Only one' }))).error).toMatch(/at least two options/);
    expect(wrote('votes', 'insert')).toHaveLength(0);
  });

  it('closes a vote whose options failed to save, and notifies no one', async () => {
    state.optionsInsert = { error: { message: 'boom' } };
    expect(await createVote(TRIP, INCIDENT, { error: null }, form())).toEqual({ error: 'We could not start the vote.' });
    expect(wrote('votes', 'update')[0].row).toEqual({ status: 'closed' });
    expect(queueNotifications).not.toHaveBeenCalled();
  });

  it('still opens the vote when a notification fails', async () => {
    queueNotifications.mockRejectedValueOnce(new Error('resend down'));
    await expect(createVote(TRIP, INCIDENT, { error: null }, form())).rejects.toThrow(`REDIRECT:/trips/${TRIP}/votes/${VOTE}`);
  });
});

describe('respondVote', () => {
  it('records the answer through respond_vote', async () => {
    await respondVote(TRIP, VOTE, OPTION);
    expect(rpc).toHaveBeenCalledWith('respond_vote', { p_vote_id: VOTE, p_option_id: OPTION });
  });

  it('refuses a non-member before the vote is read', async () => {
    state.isMember = false;
    await expect(respondVote(TRIP, VOTE, OPTION)).rejects.toThrow('That vote is not on this trip.');
    expect(rpc.mock.calls.some(([name]) => name === 'respond_vote')).toBe(false);
    expect(log).toHaveLength(0);
  });

  it('refuses a vote on another trip and an option on another vote', async () => {
    state.vote = null;
    await expect(respondVote(TRIP, VOTE, OPTION)).rejects.toThrow('That vote is not on this trip.');
    expect(log.find((l) => l.table === 'votes')!.filters).toContainEqual(['trip_id', TRIP]);
    state.vote = { id: VOTE };
    state.option = null;
    await expect(respondVote(TRIP, VOTE, OPTION)).rejects.toThrow('That option is not on this vote.');
    expect(log.filter((l) => l.table === 'vote_options')[0].filters).toContainEqual(['vote_id', VOTE]);
    expect(rpc.mock.calls.some(([name]) => name === 'respond_vote')).toBe(false);
  });

  it('turns respond_vote rejections into plain messages', async () => {
    state.respondError = { code: '42501', message: 'not a voter on this vote' };
    await expect(respondVote(TRIP, VOTE, OPTION)).rejects.toThrow('This vote is for the travelers on the affected flight.');
    state.respondError = { code: '22023', message: 'vote is closed' };
    await expect(respondVote(TRIP, VOTE, OPTION)).rejects.toThrow('That vote is closed.');
  });
});

describe('closeVote', () => {
  it('closes within the trip', async () => {
    await closeVote(TRIP, VOTE);
    const update = wrote('votes', 'update')[0];
    expect(update.row).toEqual({ status: 'closed' });
    expect(update.filters).toEqual([['id', VOTE], ['trip_id', TRIP]]);
  });

  it('says so when RLS matched no row (wrong role or another trip)', async () => {
    state.closeRows = [];
    await expect(closeVote(TRIP, VOTE)).rejects.toThrow('Only the planner or whoever started the vote can close it.');
  });
});
