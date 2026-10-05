import { describe, expect, it } from 'vitest';
import { classify, flightEnded, type FlightSnapshot } from '@/lib/monitor/snapshot';

const base: FlightSnapshot = {
  faFlightId: 'TAP204-1',
  cancelled: false,
  diverted: false,
  scheduledOut: '2026-11-03T23:15:00Z',
  estimatedOut: '2026-11-03T23:15:00Z',
  actualOut: null,
  scheduledIn: '2026-11-04T06:35:00Z',
  estimatedIn: '2026-11-04T06:35:00Z',
  actualIn: null,
  arrivalDelayMinutes: 0,
};

describe('classify', () => {
  it('reports a new cancellation once', () => {
    expect(classify(base, { ...base, cancelled: true })).toEqual({ type: 'cancellation', delayMinutes: null, dedupeSuffix: 'cancellation' });
    expect(classify({ ...base, cancelled: true }, { ...base, cancelled: true })).toBeNull();
  });

  it('reports delays only when they cross a new band', () => {
    expect(classify(base, { ...base, arrivalDelayMinutes: 95 })).toBeNull();
    expect(classify(base, { ...base, arrivalDelayMinutes: 130 })).toEqual({ type: 'delay', delayMinutes: 130, dedupeSuffix: 'delay-120' });
    expect(classify({ ...base, arrivalDelayMinutes: 130 }, { ...base, arrivalDelayMinutes: 170 })).toBeNull();
    expect(classify({ ...base, arrivalDelayMinutes: 170 }, { ...base, arrivalDelayMinutes: 200 })).toEqual({ type: 'delay', delayMinutes: 200, dedupeSuffix: 'delay-180' });
  });

  it('derives the delay from estimated times when AeroAPI omits it', () => {
    expect(classify(base, { ...base, arrivalDelayMinutes: null, estimatedIn: '2026-11-04T09:45:00Z' })).toMatchObject({ type: 'delay', delayMinutes: 190 });
  });

  it('treats a diversion as a delay of unknown length, not a schedule change', () => {
    expect(classify(base, { ...base, diverted: true })).toEqual({ type: 'delay', delayMinutes: null, dedupeSuffix: 'diversion' });
  });

  it('reports the same flight moved to another time as a schedule change, once per new time', () => {
    const booked = base.scheduledOut;
    const earlier = { ...base, scheduledOut: '2026-11-03T21:45:00Z' };
    expect(classify(base, earlier, booked)).toEqual({ type: 'schedule_change', delayMinutes: null, dedupeSuffix: 'retime-2026-11-03T21:45:00.000Z' });
    expect(classify(null, earlier, booked)).toMatchObject({ type: 'schedule_change' });
    expect(classify(earlier, earlier, booked)).toBeNull();
    // Under an hour from the booked time is schedule-data noise.
    expect(classify(base, { ...base, scheduledOut: '2026-11-03T23:45:00Z' }, booked)).toBeNull();
  });
});

describe('flightEnded', () => {
  it('ends on arrival or cancellation', () => {
    expect(flightEnded(base)).toBe(false);
    expect(flightEnded({ ...base, actualIn: '2026-11-04T06:40:00Z' })).toBe(true);
    expect(flightEnded({ ...base, cancelled: true })).toBe(true);
  });
});
