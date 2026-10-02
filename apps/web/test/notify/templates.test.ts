import { describe, expect, it } from 'vitest';
import { briefingNotice, documentNotice, incidentNotice, questionNotice, reviewHoldNotice, voteNotice } from '@/lib/notify/templates';

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

describe('templates, SMS safety and copy rules', () => {
  const all = () => [
    incidentNotice({ tripName: 'T', headline: 'H', url: 'https://x.test/a' }),
    questionNotice({ tripName: 'T', prompt: 'P', url: 'https://x.test/a' }),
    voteNotice({ tripName: 'T', title: 'V', url: 'https://x.test/a' }),
    documentNotice({ tripName: 'T', url: 'https://x.test/a' }),
    briefingNotice({ tripName: 'T', url: 'https://x.test/a' }),
    reviewHoldNotice({ tripName: 'T', url: 'https://x.test/a' }),
  ];

  it('never says we filed, booked or rebooked', () => {
    for (const n of all()) {
      for (const field of [n.subject, n.text, n.sms]) expect(field).not.toMatch(/\b(we filed|filed for you|we booked|we rebooked)\b/i);
    }
    expect(all().map((n) => n.text).join(' ')).not.toMatch(/\bfiled\b/i);
  });

  it('keeps SMS GSM-7: no curly quotes, dashes or ellipsis characters', () => {
    const n = questionNotice({ tripName: 'Lisbon — 2026', prompt: 'Did anyone accept the airline’s “new” flight…' + 'y'.repeat(400), url: 'https://x.test/q' });
    expect(n.sms).not.toMatch(/[’‘“”–—…]/);
    expect(n.sms.endsWith('https://x.test/q')).toBe(true);
    expect(n.sms.length).toBeLessThanOrEqual(320);
    expect(n.sms).toContain('...');
  });

  it('does not split a surrogate pair when truncating', () => {
    const n = incidentNotice({ tripName: 'T', headline: '😀'.repeat(400), url: 'https://x.test/l' });
    expect(n.sms).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
  });

  it('survives a URL so long there is no room for the body', () => {
    const url = `https://x.test/${'a'.repeat(400)}`;
    expect(incidentNotice({ tripName: 'T', headline: 'Cancelled', url }).sms).toBe(`Elsewhere: ${url}`);
  });
});
