import type { NextRequest, NextResponse } from 'next/server';

export const ANONYMOUS_ID_COOKIE = 'elsewhere_aid';
export const ANONYMOUS_ID_MAX_AGE = 60 * 60 * 24 * 365;
const PATTERN = /^[0-9a-f]{32}$/;

export function isAnonymousId(value: string | null | undefined): value is string {
  return typeof value === 'string' && PATTERN.test(value);
}

export function newAnonymousId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/** Sets the cookie on the incoming request so this same render already sees it. Returns the new id, or null if one existed. */
export function assignAnonymousId(request: NextRequest): string | null {
  if (isAnonymousId(request.cookies.get(ANONYMOUS_ID_COOKIE)?.value)) return null;
  const id = newAnonymousId();
  request.cookies.set(ANONYMOUS_ID_COOKIE, id);
  return id;
}

export function persistAnonymousId(response: NextResponse, id: string | null): void {
  if (!id) return;
  response.cookies.set(ANONYMOUS_ID_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ANONYMOUS_ID_MAX_AGE,
  });
}
