import { describe, expect, it } from 'vitest';
import { briefingNotice, documentNotice, incidentAlert, incidentNotice, questionNotice, reviewHoldNotice, voteNotice } from '@/lib/notify/templates';

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

describe('incidentAlert (the early heads-up)', () => {
  const url = 'https://x.test/trips/1/incidents/2';
  const bookingsUrl = 'https://x.test/trips/1/bookings';
  const headlines = [
    'TP 204 from LIS on Nov 3 was cancelled.',
    'A3 349 from ATH on Nov 5 is running 3 h 20 min late.',
    'A3 349 from ATH on Nov 5 was diverted.',
    'TP 204 from EWR on Nov 3 was moved to a new time.',
  ];
  const FORBIDDEN = /owed|will get|compensation|refund|entitled/i;

  it('states the fact, promises a plan, and links to the incident', () => {
    const notice = incidentAlert({ tripName: 'Lisbon 2026', headline: headlines[0], url });
    expect(notice.subject).toBe('Lisbon 2026: TP 204 from LIS on Nov 3 was cancelled.');
    expect(notice.text).toContain("We're checking which passenger protections apply and will send your plan here:");
    expect(notice.text).toContain(url);
    expect(notice.sms).toContain(url);
    expect(notice.sms.length).toBeLessThanOrEqual(320);
  });

  it('claims no entitlement, for any kind of event, to the group or to the planner', () => {
    for (const headline of headlines) {
      for (const notice of [incidentAlert({ tripName: 'Lisbon 2026', headline, url }), incidentAlert({ tripName: 'Lisbon 2026', headline, url, bookingsUrl })]) {
        expect(`${notice.subject}\n${notice.text}\n${notice.sms}`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it('tells the planner nobody is on the booking, with the bookings link', () => {
    const notice = incidentAlert({ tripName: 'Lisbon 2026', headline: headlines[0], url, bookingsUrl });
    expect(notice.text).toContain(`Nobody is on this booking yet. Add who's flying: ${bookingsUrl}`);
    expect(notice.sms).toContain(bookingsUrl);
    expect(incidentAlert({ tripName: 'T', headline: 'H', url }).text).not.toContain('Nobody is on this booking');
  });

  it('words the plan-ready notice neutrally, for the group and for the planner', () => {
    for (const headline of headlines) {
      for (const notice of [incidentNotice({ tripName: 'T', headline, url }), incidentNotice({ tripName: 'T', headline, url, bookingsUrl })]) {
        expect(`${notice.subject}\n${notice.text}\n${notice.sms}`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it('links both the plan and the bookings page in the planner’s SMS', () => {
    for (const notice of [incidentNotice({ tripName: 'T', headline: headlines[0], url, bookingsUrl }), incidentAlert({ tripName: 'T', headline: headlines[0], url, bookingsUrl })]) {
      expect(notice.sms).toContain(url);
      expect(notice.sms).toContain(bookingsUrl);
      expect(notice.sms.length).toBeLessThanOrEqual(320);
    }
  });

  it('says the plan is ready in the later notice, and adds the planner line only when asked', () => {
    const ready = incidentNotice({ tripName: 'Lisbon 2026', headline: headlines[0], url });
    expect(ready.subject).toContain('your plan is ready');
    expect(ready.text).toContain('We drafted');
    expect(ready.text).not.toContain('Nobody is on this booking');
    expect(incidentNotice({ tripName: 'T', headline: 'H', url, bookingsUrl }).text).toContain(`Nobody is on this booking yet. Add who's flying: ${bookingsUrl}`);
  });
});

describe('templates, SMS safety and copy rules', () => {
  const all = () => [
    incidentNotice({ tripName: 'T', headline: 'H', url: 'https://x.test/a' }),
    incidentAlert({ tripName: 'T', headline: 'H', url: 'https://x.test/a' }),
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
