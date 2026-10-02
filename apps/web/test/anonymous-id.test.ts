import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_ID_COOKIE,
  assignAnonymousId,
  isAnonymousId,
  newAnonymousId,
  persistAnonymousId,
} from '@/lib/funnel/anonymous-id';

describe('anonymous id', () => {
  it('generates 32 lowercase hex characters', () => {
    const id = newAnonymousId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(isAnonymousId(id)).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isAnonymousId(undefined)).toBe(false);
    expect(isAnonymousId('abc')).toBe(false);
    expect(isAnonymousId('Z'.repeat(32))).toBe(false);
  });

  it('assigns a new id to a request without one and persists it on the response', () => {
    const request = new NextRequest('https://example.test/rules');
    const id = assignAnonymousId(request);
    expect(id).not.toBeNull();
    expect(request.cookies.get(ANONYMOUS_ID_COOKIE)?.value).toBe(id);
    const response = NextResponse.next();
    persistAnonymousId(response, id);
    expect(response.cookies.get(ANONYMOUS_ID_COOKIE)?.value).toBe(id);
  });

  it('keeps an existing valid id', () => {
    const existing = newAnonymousId();
    const request = new NextRequest('https://example.test/rules', { headers: { cookie: `${ANONYMOUS_ID_COOKIE}=${existing}` } });
    expect(assignAnonymousId(request)).toBeNull();
    expect(request.cookies.get(ANONYMOUS_ID_COOKIE)?.value).toBe(existing);
  });
});
