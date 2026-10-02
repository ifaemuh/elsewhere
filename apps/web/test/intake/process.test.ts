import { describe, expect, it } from 'vitest';
import type { NormalizedBooking } from '@/lib/intake/normalize';
import { PermanentIntakeError, failPhase, processInboundMessage, type IntakeDeps } from '@/lib/intake/process';

const booking = (overrides: Partial<NormalizedBooking> = {}): NormalizedBooking => ({
  kind: 'flight',
  provider: 'TAP Air Portugal',
  confirmationCode: 'ABC123',
  bookedVia: null,
  bookedAt: null,
  passengerNames: ['DOE/PAT MR', 'JONES/SAMANTHA MS'],
  segments: [{ carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', destinationIata: 'LIS', departureLocal: '2026-11-03T18:15', arrivalLocal: null }],
  confidence: 0.97,
  dedupeKey: 'flight|ABC123|TP204@2026-11-03',
  problems: [],
  ...overrides,
});

function harness(opts: { source?: 'email' | 'screenshot'; bookings?: NormalizedBooking[]; problems?: string[]; existing?: string[]; ownRetry?: string[]; afterConfirmedFails?: boolean; emailProblems?: string[]; providerMessageId?: string | null; storagePath?: string | null } = {}) {
  const log = {
    saved: [] as { dedupeKey: string; confirmed: boolean }[],
    assigned: [] as { bookingId: string; memberIds: string[] }[],
    items: [] as { source_kind: string; title: string; detail: string }[],
    status: [] as string[],
    errors: [] as (string | null)[],
    forwarded: 0,
    confirmed: [] as string[][],
    extracted: [] as unknown[],
  };
  const deps: IntakeDeps = {
    loadMessage: async () => ({ id: 'msg-1', tripId: 'trip-1', source: opts.source ?? 'email', providerMessageId: opts.providerMessageId === undefined ? 'em_1' : opts.providerMessageId, storagePath: opts.storagePath !== undefined ? opts.storagePath : opts.source === 'screenshot' ? 'trip-1/screenshots/a.png' : null, subject: 'Your TAP booking' }),
    loadEmail: async () => ({ id: 'em_1', from: 'pat@example.test', subject: 'Your TAP booking', text: 'itinerary', html: null, attachments: [], problems: opts.emailProblems ?? [] }),
    storeEmail: async () => 'trip-1/msg-1/email.json',
    loadScreenshot: async () => ({ data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }),
    extract: async (input) => {
      log.extracted.push(input);
      return { bookings: opts.bookings ?? [booking()], problems: opts.problems ?? [] };
    },
    members: async () => [
      { id: 'm-pat', user_id: 'u-pat', display_name: 'Pat', role: 'planner' },
      { id: 'm-sam', user_id: 'u-sam', display_name: 'Sam Jones', role: 'member' },
    ],
    saveBooking: async (_message, b, { confirmed }) => {
      log.saved.push({ dedupeKey: b.dedupeKey, confirmed });
      // An existing booking from another message is skipped; one this message saved before a crash is redone.
      const skipped = (opts.existing ?? []).includes(b.dedupeKey) && !(opts.ownRetry ?? []).includes(b.dedupeKey);
      return { bookingId: `bk-${b.dedupeKey}`, created: !skipped };
    },
    assignMembers: async (_tripId, bookingId, memberIds) => {
      log.assigned.push({ bookingId, memberIds });
    },
    addActionItem: async (item) => {
      log.items.push({ source_kind: item.source_kind, title: item.title, detail: item.detail });
    },
    setStatus: async (_id, status, error) => {
      log.status.push(status);
      log.errors.push(error);
    },
    recordForwarded: async () => {
      log.forwarded += 1;
    },
    afterConfirmed: async (_tripId, bookingIds) => {
      if (opts.afterConfirmedFails) throw new Error('aeroapi down');
      log.confirmed.push(bookingIds);
      return { monitorSegmentIds: ['seg-1'] };
    },
  };
  return { deps, log };
}

describe('processInboundMessage', () => {
  it('auto-confirms a clear booking whose passengers all match', async () => {
    const { deps, log } = harness();
    const result = await processInboundMessage('msg-1', deps);
    expect(result).toEqual({ status: 'parsed', bookingIds: ['bk-flight|ABC123|TP204@2026-11-03'], monitorSegmentIds: ['seg-1'] });
    expect(log.saved).toEqual([{ dedupeKey: 'flight|ABC123|TP204@2026-11-03', confirmed: true }]);
    expect(log.assigned).toEqual([{ bookingId: 'bk-flight|ABC123|TP204@2026-11-03', memberIds: ['m-pat', 'm-sam'] }]);
    expect(log.confirmed).toEqual([['bk-flight|ABC123|TP204@2026-11-03']]);
    expect(log.forwarded).toBe(1);
  });

  it('asks the planner to confirm a low-confidence booking', async () => {
    const { deps, log } = harness({ bookings: [booking({ confidence: 0.6 })] });
    const result = await processInboundMessage('msg-1', deps);
    expect(result.status).toBe('needs_confirmation');
    expect(log.saved[0].confirmed).toBe(false);
    expect(log.items).toContainEqual(expect.objectContaining({ source_kind: 'booking_confirmation', title: 'Confirm this booking' }));
    expect(log.confirmed).toEqual([]);
  });

  it('asks who an unmatched passenger is', async () => {
    const { deps, log } = harness({ bookings: [booking({ passengerNames: ['DOE/PAT MR', 'SMITH/TERRY'] })] });
    await processInboundMessage('msg-1', deps);
    expect(log.items).toContainEqual(expect.objectContaining({ source_kind: 'passenger_match', title: 'Who is on this booking?' }));
    expect(log.saved[0].confirmed).toBe(false);
  });

  it('fails clearly when nothing was found', async () => {
    const { deps, log } = harness({ bookings: [] });
    expect(await processInboundMessage('msg-1', deps)).toEqual({ status: 'failed', reason: 'no booking found' });
    expect(log.status).toEqual(['failed']);
    expect(log.items[0].title).toBe('We couldn’t read a booking');
  });

  it('does not reprocess a booking it already has', async () => {
    const { deps, log } = harness({ existing: ['flight|ABC123|TP204@2026-11-03'] });
    await processInboundMessage('msg-1', deps);
    expect(log.assigned).toEqual([]);
    expect(log.forwarded).toBe(0);
  });

  it('surfaces dropped attachments on the message when nothing was found', async () => {
    const { deps, log } = harness({ bookings: [], problems: ['a PDF was skipped: larger than 4 MB'] });
    expect(await processInboundMessage('msg-1', deps)).toEqual({ status: 'failed', reason: 'no booking found', problems: ['a PDF was skipped: larger than 4 MB'] });
    expect(log.errors).toEqual(['No booking found: a PDF was skipped: larger than 4 MB']);
    expect(log.items[0].detail).toContain('a PDF was skipped: larger than 4 MB');
  });

  it('keeps dropped attachments on the message when a booking was still found', async () => {
    const { deps, log } = harness({ problems: ['an image was skipped: unsupported type'] });
    const result = await processInboundMessage('msg-1', deps);
    expect(result.status).toBe('parsed');
    expect(log.errors).toEqual(['an image was skipped: unsupported type']);
  });

  it('redoes a booking this same message saved before a retry, so nothing is left half-done', async () => {
    const { deps, log } = harness({ existing: ['flight|ABC123|TP204@2026-11-03'], ownRetry: ['flight|ABC123|TP204@2026-11-03'] });
    await processInboundMessage('msg-1', deps);
    expect(log.assigned).toHaveLength(1);
    expect(log.confirmed).toEqual([['bk-flight|ABC123|TP204@2026-11-03']]);
  });

  it('lets a failed confirmation hook throw so the step retries', async () => {
    const { deps } = harness({ afterConfirmedFails: true });
    await expect(processInboundMessage('msg-1', deps)).rejects.toThrow('aeroapi down');
  });

  it('marks the message done only after the confirmation hook succeeds', async () => {
    const { deps, log } = harness({ afterConfirmedFails: true });
    await expect(processInboundMessage('msg-1', deps)).rejects.toThrow();
    expect(log.status).toEqual([]);
  });

  it('retries a throwing recordForwarded without marking the message done', async () => {
    const { deps, log } = harness();
    deps.recordForwarded = async () => {
      throw new Error('db down');
    };
    await expect(processInboundMessage('msg-1', deps)).rejects.toThrow('db down');
    expect(log.status).toEqual([]);
  });

  it('carries attachment problems found while fetching the email', async () => {
    const { deps, log } = harness({ emailProblems: ['a PDF was skipped: larger than 4 MB'] });
    await processInboundMessage('msg-1', deps);
    expect(log.errors).toEqual(['a PDF was skipped: larger than 4 MB']);
  });

  it('fails permanently, with a planner item, when the email has no provider id', async () => {
    const { deps, log } = harness({ providerMessageId: null });
    expect(await processInboundMessage('msg-1', deps)).toEqual({ status: 'failed', reason: 'missing provider message id' });
    expect(log.status).toEqual(['failed']);
    expect(log.items[0].title).toBe('We couldn’t read a booking');
  });

  it('fails permanently when a screenshot has no stored file', async () => {
    const { deps } = harness({ source: 'screenshot', storagePath: null });
    expect(await processInboundMessage('msg-1', deps)).toEqual({ status: 'failed', reason: 'screenshot has no stored file' });
  });

  it('lets a permanent error from a dependency end as a failed message, and a transient one throw', async () => {
    const permanent = harness();
    permanent.deps.extract = async () => {
      throw new PermanentIntakeError('the model could not read this message');
    };
    expect(await processInboundMessage('msg-1', permanent.deps)).toMatchObject({ status: 'failed', reason: 'the model could not read this message' });
    const transient = harness();
    transient.deps.loadEmail = async () => {
      throw new Error('resend 503');
    };
    await expect(processInboundMessage('msg-1', transient.deps)).rejects.toThrow('resend 503');
    expect(transient.log.status).toEqual([]);
  });

  it('writes no email content into the failure record', async () => {
    const { deps, log } = harness({ bookings: [] });
    await failPhase('msg-1', 'processing did not finish', [], deps, { kind: 'lookup' });
    expect(log.items).toEqual([]);
    expect(log.errors).toEqual(['Processing did not finish']);
  });

  it('reads screenshots as images', async () => {
    const { deps, log } = harness({ source: 'screenshot' });
    await processInboundMessage('msg-1', deps);
    expect(log.extracted[0]).toMatchObject({ text: null, images: [{ mediaType: 'image/png' }] });
  });
});
