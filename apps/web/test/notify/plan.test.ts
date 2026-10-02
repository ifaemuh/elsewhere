import { describe, expect, it } from 'vitest';
import { planDeliveries } from '@/lib/notify/plan';

const rendered = { subject: 'S', text: 'T', sms: 'M' };
const now = new Date('2026-11-04T03:00:00Z'); // 10pm in New York

const recipients = [
  { id: 'u1', email: 'a@x.test', phone: '+15550000001', sms_opt_in: true, sms_consent: true, timezone: 'America/New_York' },
  { id: 'u2', email: null, phone: '+15550000002', sms_opt_in: false, sms_consent: true, timezone: 'America/New_York' },
];

const base = { tripId: 't', template: 'incident', rendered, urgent: true };

describe('planDeliveries', () => {
  it('sends urgent alerts now, by email and by SMS where the member opted in', () => {
    const rows = planDeliveries(recipients, { ...base, userIds: ['u1', 'u2'] }, now, true);
    expect(rows.map((r) => [r.user_id, r.channel, r.send_after])).toEqual([
      ['u1', 'email', now.toISOString()],
      ['u1', 'sms', now.toISOString()],
    ]);
  });

  it('holds non-urgent messages until morning and skips SMS when it is switched off', () => {
    const rows = planDeliveries(recipients, { userIds: ['u1'], tripId: 't', template: 'briefing', rendered, urgent: false }, now, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('email');
    expect(rows[0].send_after).toBe('2026-11-04T13:00:00.000Z');
  });

  it('plans no SMS when opt-in is true but there is no active consent record', () => {
    const rows = planDeliveries([{ ...recipients[0], sms_consent: false }], { ...base, userIds: ['u1'] }, now, true);
    expect(rows.map((r) => r.channel)).toEqual(['email']);
  });

  it('plans no SMS without a phone', () => {
    const rows = planDeliveries([{ ...recipients[0], phone: null }], { ...base, userIds: ['u1'] }, now, true);
    expect(rows.map((r) => r.channel)).toEqual(['email']);
  });

  it('uses New York quiet hours when the stored zone is empty', () => {
    const rows = planDeliveries([{ ...recipients[0], timezone: '' }], { ...base, urgent: false, userIds: ['u1'] }, now, false);
    expect(rows[0].send_after).toBe('2026-11-04T13:00:00.000Z');
  });
});
