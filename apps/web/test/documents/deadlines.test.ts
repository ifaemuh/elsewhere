import { describe, expect, it } from 'vitest';
import { passportSentence, renewalAdvice } from '@/lib/documents/deadlines';

const route = {
  official_label: 'Renew online with the U.S. State Department',
  official_url: 'https://travel.state.gov/content/travel/en/passports/have-passport/renew-online.html',
  official_note: null,
  routine_processing_days: 56,
  expedited_processing_days: 21,
  affiliate_label: null,
  affiliate_url: null,
  affiliate_disclosure: null,
};

describe('renewalAdvice', () => {
  it('routine when there is time, expedited when it is tight, urgent when neither fits', () => {
    expect(renewalAdvice('2026-11-03', route, new Date('2026-08-01T12:00:00Z'))).toEqual({ kind: 'routine', renewBy: '2026-09-08' });
    expect(renewalAdvice('2026-11-03', route, new Date('2026-09-20T12:00:00Z'))).toEqual({ kind: 'expedited', renewBy: '2026-10-13' });
    expect(renewalAdvice('2026-11-03', route, new Date('2026-10-25T12:00:00Z'))).toEqual({ kind: 'urgent' });
  });
});

describe('passportSentence', () => {
  it('says what is wrong and what to do by when', () => {
    expect(
      passportSentence({ expiresOn: '2027-01-15', tripEnd: '2026-11-10', requiredMonths: 3, countryName: 'Portugal', advice: { kind: 'routine', renewBy: '2026-09-08' } }),
    ).toBe('Your passport expires 2 months after the trip; Portugal needs 3. Renew online by Sep 8, 2026 to make routine processing.');
  });

  it('says expired, never "0 months after", when the passport lapses before the return', () => {
    const sentence = passportSentence({ expiresOn: '2026-11-05', tripEnd: '2026-11-10', requiredMonths: 3, countryName: 'Portugal', advice: { kind: 'urgent' } });
    expect(sentence).toMatch(/expires before the trip ends/);
    expect(sentence).not.toMatch(/0 months after/);
  });
});
