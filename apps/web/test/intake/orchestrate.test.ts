import { describe, expect, it, vi } from 'vitest';
import { runIntake, type IntakeSteps } from '@/lib/intake/orchestrate';
import type { ReadyExtraction } from '@/lib/intake/process';

const extraction = (bookings: unknown[] = [{}]): ReadyExtraction =>
  ({ status: 'ready', message: { id: 'm' }, storagePath: 'trip/m/email.json', bookings, problems: ['p'] }) as unknown as ReadyExtraction;

function steps(overrides: Partial<IntakeSteps> = {}) {
  const s = {
    claim: vi.fn(async () => true),
    extract: vi.fn(async () => extraction()),
    persist: vi.fn(async () => ({ bookingIds: ['b'], confirmedIds: ['b'], needsConfirmation: false })),
    confirm: vi.fn(async () => ({ status: 'parsed' as const, bookingIds: ['b'], monitorSegmentIds: ['s'] })),
    markFailed: vi.fn(async (_id: string, reason: string) => ({ status: 'failed' as const, reason })),
    ...overrides,
  };
  return s as typeof s & IntakeSteps;
}

describe('runIntake', () => {
  it('runs extract, persist, confirm once each, handing results forward', async () => {
    const s = steps();
    expect(await runIntake('m', s)).toMatchObject({ status: 'parsed', monitorSegmentIds: ['s'] });
    expect(s.extract).toHaveBeenCalledTimes(1);
    expect(s.persist).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
    expect(s.markFailed).not.toHaveBeenCalled();
  });

  it('returns missing without any other step', async () => {
    const s = steps({ extract: vi.fn(async () => ({ status: 'missing' as const })) });
    expect(await runIntake('m', s)).toEqual({ status: 'missing' });
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('marks an empty extraction failed without persisting', async () => {
    const s = steps({ extract: vi.fn(async () => extraction([])) });
    await runIntake('m', s);
    expect(s.markFailed).toHaveBeenCalledWith('m', 'no booking found', ['p'], 'unreadable', 'trip/m/email.json');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('keeps a FatalError reason, but not the text of any other error', async () => {
    const fatal = Object.assign(new Error('missing provider message id'), { name: 'FatalError' });
    const a = steps({ extract: vi.fn(async () => { throw fatal; }) });
    await runIntake('m', a);
    expect(a.markFailed).toHaveBeenCalledWith('m', 'missing provider message id', [], 'unreadable', null);
    const b = steps({ persist: vi.fn(async () => { throw new Error('insert failed for Pat Doe ABC123'); }) });
    await runIntake('m', b);
    expect(b.markFailed).toHaveBeenCalledWith('m', 'processing did not finish', ['p'], 'save', 'trip/m/email.json');
  });

  it('reports a confirmation failure as a lookup failure, after the bookings were saved', async () => {
    const s = steps({ confirm: vi.fn(async () => { throw new Error('aeroapi 500'); }) });
    await runIntake('m', s);
    expect(s.markFailed).toHaveBeenCalledWith('m', 'flight lookup did not finish', ['p'], 'lookup', 'trip/m/email.json');
    expect(s.extract).toHaveBeenCalledTimes(1);
  });

  it('exits cleanly, doing nothing, when another run already owns the message', async () => {
    const s = steps({ claim: vi.fn(async () => false) });
    expect(await runIntake('m', s)).toEqual({ status: 'claimed_elsewhere' });
    expect(s.extract).not.toHaveBeenCalled();
    expect(s.markFailed).not.toHaveBeenCalled();
  });

  it('pays for exactly one extraction when two runs start concurrently', async () => {
    let status = 'received';
    const claim = async () => {
      await Promise.resolve();
      if (status !== 'received') return false;
      status = 'processing';
      return true;
    };
    const a = steps({ claim });
    const b = steps({ claim, extract: a.extract });
    await Promise.all([runIntake('m', a), runIntake('m', b)]);
    expect(a.extract).toHaveBeenCalledTimes(1);
  });

  it('marks a claimed message failed (never back to received) when a later step fails', async () => {
    const s = steps({ persist: vi.fn(async () => { throw new Error('boom'); }) });
    await runIntake('m', s);
    expect(s.claim).toHaveBeenCalledTimes(1);
    expect(s.markFailed).toHaveBeenCalledTimes(1);
  });

  it('lets the same run re-claim its own message after a lost step result, then proceeds to extraction', async () => {
    const owner = { current: null as string | null };
    const claimFor = (run: string) => async () => {
      if (owner.current === null || owner.current === run) {
        owner.current = run;
        return true;
      }
      return false;
    };
    await claimFor('run-1')(); // the first claim committed, but its result was lost
    const retry = steps({ claim: claimFor('run-1') });
    await runIntake('m', retry);
    expect(retry.extract).toHaveBeenCalledTimes(1);
    const other = steps({ claim: claimFor('run-2') });
    expect(await runIntake('m', other)).toEqual({ status: 'claimed_elsewhere' });
  });

  it('marks a message failed with a neutral reason when the claim itself fails', async () => {
    const s = steps({ claim: vi.fn(async () => { throw new Error('db down for Pat Doe'); }) });
    await runIntake('m', s);
    expect(s.markFailed).toHaveBeenCalledWith('m', 'could not start processing', [], 'claim', null);
    expect(s.extract).not.toHaveBeenCalled();
  });
});
