import { describe, expect, it } from 'vitest';
import { incidentNotice, questionNotice, voteNotice } from '@/lib/notify/templates';

describe('templates', () => {
  it('keeps SMS short and always includes the link', () => {
    const notice = incidentNotice({ tripName: 'Lisbon 2026', headline: 'TP 204 on Nov 3 was cancelled. You may be owed a cash refund.', url: 'https://x.test/trips/1/incidents/2' });
    expect(notice.sms.length).toBeLessThanOrEqual(320);
    expect(notice.sms).toContain('https://x.test/trips/1/incidents/2');
    expect(notice.text).toContain('We drafted');
  });

  it('asks the planner one question with a link', () => {
    const notice = questionNotice({ tripName: 'Lisbon 2026', prompt: 'Did anyone accept the airline’s new flight or a travel credit?', url: 'https://x.test/q' });
    expect(notice.subject).toContain('Lisbon 2026');
    expect(notice.sms).toContain('https://x.test/q');
  });

  it('links votes', () => {
    expect(voteNotice({ tripName: 'Lisbon 2026', title: 'Which flight?', url: 'https://x.test/v' }).sms).toContain('https://x.test/v');
  });

  it('truncates a long headline but keeps the link', () => {
    const notice = incidentNotice({ tripName: 'T', headline: 'x'.repeat(1000), url: 'https://x.test/l' });
    expect(notice.sms.length).toBeLessThanOrEqual(320);
    expect(notice.sms.endsWith('https://x.test/l')).toBe(true);
  });
});
