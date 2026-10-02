import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyOtp = vi.fn();
const signInWithOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp, signInWithOtp } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { loginAction, type LoginState } from '@/app/login/actions';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}
const emailStep: LoginState = { step: 'email', email: '', error: null };
const verifyStep: LoginState = { step: 'verify', email: 'pat@example.test', error: null };

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
});

describe('loginAction verify', () => {
  const verify = (next: string) => loginAction(verifyStep, form({ intent: 'verify', email: 'pat@example.test', code: '123 456', next }));

  it.each(['//evil.test', 'https://evil.test', '/\tevil', '/\\evil.test'])('sends a hostile next (%j) to /trips', async (next) => {
    await expect(verify(next)).rejects.toThrow('REDIRECT:/trips');
  });

  it('honors a safe next', async () => {
    await expect(verify('/trips/abc')).rejects.toThrow('REDIRECT:/trips/abc');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'pat@example.test', token: '123456', type: 'email' });
  });

  it('returns the generic message and does not redirect on a verifyOtp error', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    const result = await verify('/trips/abc');
    expect(result).toEqual({
      step: 'verify',
      email: 'pat@example.test',
      error: 'That code did not work. Check it, or go back and request a new one.',
    });
  });

  it('stays on the verify step without a code, and falls back to the previous email', async () => {
    const noCode = await loginAction(verifyStep, form({ intent: 'verify', email: 'pat@example.test', code: 'abc' }));
    expect(noCode).toEqual({ step: 'verify', email: 'pat@example.test', error: 'Enter the code from the email.' });
    const noEmail = await loginAction(verifyStep, form({ intent: 'verify', email: 'not-an-email', code: '123456' })).catch((e) => e);
    expect(verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'pat@example.test' }));
    expect(noEmail).toBeInstanceOf(Error);
    verifyOtp.mockClear();
    const none = await loginAction(emailStep, form({ intent: 'verify', code: '123456' }));
    expect(none.step).toBe('verify');
    expect(none.error).toBe('Enter the code from the email.');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe('loginAction send', () => {
  it('moves to verify on success and normalizes the email', async () => {
    const result = await loginAction(emailStep, form({ intent: 'send', email: ' Pat@Example.TEST ' }));
    expect(result).toEqual({ step: 'verify', email: 'pat@example.test', error: null });
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'pat@example.test', options: { shouldCreateUser: true } });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('stays on the email step with an error when sending fails', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'rate limit' } });
    const result = await loginAction(emailStep, form({ intent: 'send', email: 'pat@example.test' }));
    expect(result).toEqual({ step: 'email', email: 'pat@example.test', error: 'We could not send a code just now. Try again in a minute.' });
  });

  it('rejects an invalid email without calling Supabase', async () => {
    const result = await loginAction(emailStep, form({ intent: 'send', email: 'pat@' }));
    expect(result).toEqual({ step: 'email', email: '', error: 'Enter a valid email address.' });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('treats a missing intent as send', async () => {
    await loginAction(emailStep, form({ email: 'pat@example.test' }));
    expect(signInWithOtp).toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
