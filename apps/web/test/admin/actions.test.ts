import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { HookNotFoundError } from 'workflow/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/rules-library.json';

type Result = { data: unknown; error: { message: string } | null };
interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const calls: Call[] = [];
const results = new Map<string, Result | ((call: Call) => Result)>();
let admin = true;

function client() {
  return {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      const resolve = (): Result => {
        calls.push(call);
        const stored = results.get(`${table}.${call.op}`);
        const r = typeof stored === 'function' ? stored(call) : stored;
        return r ?? { data: call.op === 'select' ? null : [], error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), q),
        update: (p: unknown) => ((call.op = 'update'), (call.payload = p), q),
        delete: () => ((call.op = 'delete'), q),
        eq: (k: string, v: unknown) => (call.filters.push([k, v]), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => resolve(),
        single: async () => resolve(),
        then: (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad),
      };
      return q;
    },
  };
}

const requireAdmin = vi.hoisted(() => vi.fn());
const start = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
const resumeHook = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
const wakeTripMonitor = vi.hoisted(() => vi.fn(async (_tripId: string) => undefined));
const runDocumentChecks = vi.hoisted(() => vi.fn(async (_tripId: string) => undefined));
const approveQuarantined = vi.hoisted(() => vi.fn(async (_id: string, _trip: string | null) => true));
const assessIncident = vi.hoisted(() => vi.fn());
const stuckIncidents = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => [{ id: 'i1' }]));
const stuckMessages = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => [{ id: 'm1' }]));

vi.mock('@/lib/admin/guard', () => ({ requireAdmin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: client }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('workflow/api', () => ({ start, resumeHook }));
vi.mock('@/lib/workflows/wake', () => ({ wakeTripMonitor }));
vi.mock('@/lib/documents/service', () => ({ runDocumentChecks }));
vi.mock('@/lib/intake/quarantine', () => ({ approveQuarantined }));
vi.mock('@/lib/assist/incidents', () => ({ assessIncident }));
vi.mock('@/lib/admin/sweep', () => ({ SWEEP_AFTER_MS: 3600_000, stuckIncidents, stuckMessages }));
vi.mock('@/workflows/trip-monitor', () => ({ tripMonitorWorkflow: 'trip-monitor' }));
vi.mock('@/workflows/intake', () => ({ intakeWorkflow: 'intake' }));
vi.mock('@/workflows/incident', () => ({ incidentWorkflow: 'incident' }));

import { adminApproveQuarantined, compPass, editPlaybook, releasePlaybook, rerunChecks, startIncidentRun, startIntakeRun, startMonitoring } from '@/app/admin/actions';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const eu = rules.find((r) => r.id === 'fixture-eu261-delay-compensation')!;
const draftRule = rules.find((r) => r.status === 'draft')!;
const EMPTY = { error: null, saved: false };
const form = (value: string) => {
  const data = new FormData();
  data.set('playbook', value);
  return data;
};
const playbook = (over: Record<string, unknown> = {}) => ({
  summary: 'A3 349 landed 3 hours 20 minutes late.',
  owed: [{ text: 'Up to €250 in compensation, paid within 7 days of a valid claim.', rule_ids: [eu.id] }],
  steps: [{ text: 'Write to Aegean today.', rule_ids: [] }],
  messages: [{ to: 'airline', channel: 'email', body: 'Flight A3 349 arrived 3 hours late. Please pay EU261 compensation of up to €250.', rule_ids: [eu.id] }],
  caveats: [],
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  results.clear();
  admin = true;
  requireAdmin.mockReset().mockImplementation(async () => {
    if (!admin) throw new Error('NEXT_NOT_FOUND');
    return { id: 'founder-1', email: 'founder@example.test', phone: null };
  });
  for (const fn of [start, resumeHook, wakeTripMonitor, runDocumentChecks, approveQuarantined, assessIncident, stuckIncidents, stuckMessages]) fn.mockClear();
  approveQuarantined.mockResolvedValue(true);
  stuckIncidents.mockResolvedValue([{ id: 'i1' }]);
  stuckMessages.mockResolvedValue([{ id: 'm1' }]);
  assessIncident.mockResolvedValue({ applying: [eu], extraNumbers: ['200'] });
});

describe('every action refuses a non-admin before touching anything', () => {
  const attempts: [string, () => Promise<unknown>][] = [
    ['compPass', () => compPass('t1')],
    ['startMonitoring', () => startMonitoring('t1')],
    ['rerunChecks', () => rerunChecks('t1')],
    ['adminApproveQuarantined', () => adminApproveQuarantined('m1')],
    ['startIncidentRun', () => startIncidentRun('i1')],
    ['startIntakeRun', () => startIntakeRun('m1')],
    ['editPlaybook', () => editPlaybook('i1', EMPTY, form(JSON.stringify(playbook())))],
    ['releasePlaybook', () => releasePlaybook('i1')],
  ];
  it.each(attempts)('%s', async (_name, run) => {
    admin = false;
    await expect(run()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
    for (const fn of [start, resumeHook, wakeTripMonitor, runDocumentChecks, approveQuarantined, assessIncident, stuckIncidents, stuckMessages]) expect(fn).not.toHaveBeenCalled();
  });
});

describe('compPass', () => {
  it('comps a trip without a pass: pass row, hand-run, then monitoring started and woken', async () => {
    results.set('trips.select', { data: { pass_status: 'none' }, error: null });
    results.set('passes.insert', { data: { id: 'p1' }, error: null });
    results.set('trips.update', { data: [{ id: 't1' }], error: null });
    await compPass('t1');
    expect(calls.find((c) => c.table === 'passes')?.payload).toMatchObject({ trip_id: 't1', price_variant: 'comp', amount_cents: 0, status: 'comp', created_by: 'founder-1' });
    const update = calls.find((c) => c.table === 'trips' && c.op === 'update')!;
    expect(update.payload).toEqual({ pass_status: 'comp', hand_run: true });
    expect(update.filters).toContainEqual(['pass_status', 'none']);
    expect(start).toHaveBeenCalledWith('trip-monitor', ['t1']);
    expect(wakeTripMonitor).toHaveBeenCalledWith('t1');
  });

  it.each(['active', 'comp'])('refuses a trip that already has a %s pass, without writing', async (status) => {
    results.set('trips.select', { data: { pass_status: status }, error: null });
    await expect(compPass('t1')).rejects.toThrow('already has a pass');
    expect(calls.filter((c) => c.op !== 'select')).toEqual([]);
    expect(start).not.toHaveBeenCalled();
  });

  it('takes back its pass row when it loses a race, and starts nothing', async () => {
    results.set('trips.select', { data: { pass_status: 'none' }, error: null });
    results.set('passes.insert', { data: { id: 'p1' }, error: null });
    results.set('trips.update', { data: [], error: null });
    await expect(compPass('t1')).rejects.toThrow('already has a pass');
    expect(calls.find((c) => c.table === 'passes' && c.op === 'delete')?.filters).toContainEqual(['id', 'p1']);
    expect(start).not.toHaveBeenCalled();
  });

  it('says so when the pass is comped but monitoring would not start', async () => {
    results.set('trips.select', { data: { pass_status: 'none' }, error: null });
    results.set('passes.insert', { data: { id: 'p1' }, error: null });
    results.set('trips.update', { data: [{ id: 't1' }], error: null });
    start.mockRejectedValueOnce(new Error('queue down'));
    await expect(compPass('t1')).rejects.toThrow(/comped, but monitoring did not start.*Start monitoring/);
  });
});

describe('startMonitoring', () => {
  it('starts the trip monitor and then wakes a live one', async () => {
    results.set('trips.select', { data: { pass_status: 'active' }, error: null });
    const order: string[] = [];
    start.mockImplementationOnce(async () => void order.push('start'));
    wakeTripMonitor.mockImplementationOnce(async () => void order.push('wake'));
    await startMonitoring('t1');
    expect(start).toHaveBeenCalledWith('trip-monitor', ['t1']);
    expect(wakeTripMonitor).toHaveBeenCalledWith('t1');
    expect(order).toEqual(['start', 'wake']);
  });

  it('refuses a trip without a pass, and a missing trip', async () => {
    results.set('trips.select', { data: { pass_status: 'none' }, error: null });
    await expect(startMonitoring('t1')).rejects.toThrow('Only a trip with a pass');
    results.set('trips.select', { data: null, error: null });
    await expect(startMonitoring('t1')).rejects.toThrow('Only a trip with a pass');
    expect(start).not.toHaveBeenCalled();
    expect(wakeTripMonitor).not.toHaveBeenCalled();
  });
});

describe('rerunChecks and mail approval', () => {
  it('reruns the free document checks for the trip', async () => {
    await rerunChecks('t1');
    expect(runDocumentChecks).toHaveBeenCalledWith('t1');
    expect(start).not.toHaveBeenCalled();
  });

  it('approves across trips with a null trip id, and starts intake only when it flipped', async () => {
    await adminApproveQuarantined('m1');
    expect(approveQuarantined).toHaveBeenCalledWith('m1', null);
    expect(start).toHaveBeenCalledWith('intake', ['m1']);
    start.mockClear();
    approveQuarantined.mockResolvedValue(false);
    await adminApproveQuarantined('m1');
    expect(start).not.toHaveBeenCalled();
  });
});

describe('manual start of runs that never started', () => {
  it('starts an open, un-notified incident, and refuses one that is not in the stuck set', async () => {
    await startIncidentRun('i1');
    expect(stuckIncidents).toHaveBeenCalledWith(expect.anything(), expect.any(Date), 'i1');
    expect(start).toHaveBeenCalledWith('incident', ['i1']);
    start.mockClear();
    stuckIncidents.mockResolvedValue([]);
    await expect(startIncidentRun('i1')).rejects.toThrow('resolved or the group was already told');
    expect(start).not.toHaveBeenCalled();
  });

  it('starts intake for an unclaimed message, and refuses a claimed one', async () => {
    await startIntakeRun('m1');
    expect(start).toHaveBeenCalledWith('intake', ['m1']);
    start.mockClear();
    stuckMessages.mockResolvedValue([]);
    await expect(startIntakeRun('m1')).rejects.toThrow('already claimed');
    expect(start).not.toHaveBeenCalled();
  });
});

describe('editPlaybook', () => {
  const saveable = () => {
    results.set('playbooks.select', { data: { held_for_review: true }, error: null });
    results.set('playbooks.insert', { data: { id: 'pb2' }, error: null });
  };

  it('saves a cited, hedged edit as a new version, held while the incident’s playbook is held, and logs it', async () => {
    saveable();
    expect(await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook())))).toEqual({ error: null, saved: true });
    const insert = calls.find((c) => c.table === 'playbooks' && c.op === 'insert')!;
    expect(insert.payload).toMatchObject({ incident_id: 'i1', model: 'founder-edit', citation_check_passed: true, held_for_review: true, rules_cited: [{ rule_id: eu.id, rule_version: eu.version }] });
    expect(calls.find((c) => c.table === 'incident_events')?.payload).toEqual({ incident_id: 'i1', kind: 'playbook_edited', actor_user_id: 'founder-1', detail: { playbook_id: 'pb2' } });
  });

  it('leaves a new version visible when the latest playbook was already released', async () => {
    results.set('playbooks.select', { data: { held_for_review: false }, error: null });
    results.set('playbooks.insert', { data: { id: 'pb2' }, error: null });
    await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook())));
    expect(calls.find((c) => c.op === 'insert' && c.table === 'playbooks')?.payload).toMatchObject({ held_for_review: false });
  });

  it('refuses invalid JSON and a playbook that fails the schema, writing nothing', async () => {
    expect(await editPlaybook('i1', EMPTY, form('{nope'))).toEqual({ error: 'That is not valid JSON.', saved: false });
    const bad = await editPlaybook('i1', EMPTY, form(JSON.stringify({ summary: 'x' })));
    expect(bad.saved).toBe(false);
    expect(bad.error).toMatch(/owed/);
    expect(assessIncident).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('refuses an uncited or invented amount and shows the issue', async () => {
    const res = await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook({ owed: [{ text: 'You are owed €800.', rule_ids: [eu.id] }] }))));
    expect(res.saved).toBe(false);
    expect(res.error).toContain('Citation check failed');
    expect(res.error).toContain('number_not_in_rule');
    expect(calls).toEqual([]);
  });

  it('refuses an owed item with no rule id', async () => {
    const res = await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook({ owed: [{ text: 'Compensation.', rule_ids: [] }] }))));
    expect(res.error).toContain('missing_rule_id');
    expect(calls).toEqual([]);
  });

  it('refuses a duration the incident does not have, in minutes', async () => {
    const res = await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook({ summary: 'It landed 9 hours late.' }))));
    expect(res.saved).toBe(false);
    expect(calls).toEqual([]);
  });

  it('refuses an unhedged tier amount: money the cited rule offers in several tiers', async () => {
    const res = await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook({ owed: [{ text: 'You are owed €600.', rule_ids: [eu.id] }] }))));
    expect(res.saved).toBe(false);
    expect(res.error).toContain('tier_not_hedged');
    expect(calls).toEqual([]);
  });

  it('refuses a forbidden phrase', async () => {
    const res = await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook({ steps: [{ text: 'We filed the claim for you.', rule_ids: [] }] }))));
    expect(res.error).toContain('forbidden_phrase');
    expect(calls).toEqual([]);
  });

  it('refuses to cite a draft rule: only verified rules are allowed', async () => {
    assessIncident.mockResolvedValue({ applying: [draftRule, eu], extraNumbers: ['200'] });
    const res = await editPlaybook('i1', EMPTY, form(JSON.stringify(playbook({ steps: [{ text: 'Do the thing.', rule_ids: [draftRule.id] }] }))));
    expect(res.error).toContain('rule_not_allowed');
    expect(calls).toEqual([]);
  });

  it('throws when the save fails, instead of reporting saved', async () => {
    results.set('playbooks.select', { data: { held_for_review: true }, error: null });
    results.set('playbooks.insert', { data: null, error: { message: 'disk full' } });
    await expect(editPlaybook('i1', EMPTY, form(JSON.stringify(playbook())))).rejects.toThrow('disk full');
  });
});

describe('releasePlaybook', () => {
  it('resumes the incident’s release hook as the founder', async () => {
    await releasePlaybook('i1');
    expect(resumeHook).toHaveBeenCalledWith('incident-release:i1', { releasedBy: 'founder-1' });
  });

  it('logs and returns when the hold already ran out and the hook is gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resumeHook.mockRejectedValueOnce(new HookNotFoundError('incident-release:i1'));
    await expect(releasePlaybook('i1')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not swallow other failures', async () => {
    resumeHook.mockRejectedValueOnce(new Error('network'));
    await expect(releasePlaybook('i1')).rejects.toThrow('network');
  });
});
