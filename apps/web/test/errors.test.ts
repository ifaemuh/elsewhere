import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AuthError, errorResponse } from '@/lib/utils/errors';

describe('errorResponse', () => {
  it('maps AuthError to 401', async () => {
    const res = errorResponse(new AuthError('Missing authorization token'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized', message: 'Missing authorization token', statusCode: 401 });
  });

  it('maps ZodError to 400 with field paths', async () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    if (parsed.success) throw new Error('expected failure');
    const res = errorResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('email');
  });

  it('hides internal error messages behind a generic 500', async () => {
    const res = errorResponse(new Error('db password is hunter2'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Error', message: 'Internal server error', statusCode: 500 });
  });
});
