import { describe, expect, it } from 'vitest';
import { parseSender, senderAllowed } from '@/lib/intake/sender';

describe('parseSender', () => {
  it('reads display-name and bare forms', () => {
    expect(parseSender('Pat Doe <Pat@Example.TEST>')).toBe('pat@example.test');
    expect(parseSender('pat@example.test')).toBe('pat@example.test');
    expect(parseSender('not an address')).toBeNull();
  });
});

describe('senderAllowed', () => {
  it('accepts only the trip’s known emails', () => {
    expect(senderAllowed('pat@example.test', ['Pat@example.test', 'sam@example.test'])).toBe(true);
    expect(senderAllowed('mallory@example.test', ['pat@example.test'])).toBe(false);
  });
});
