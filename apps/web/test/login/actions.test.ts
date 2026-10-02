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
const { rateLimited } = vi.hoisted(() => ({ rateLimited: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_RULES: { codeSend: 'auth-code-send', tripCreate: 'trips-create' }, rateLimited }));

import { loginAction, type LoginState } from '@/app/login/actions';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}
const contactStep: LoginState = { step: 'contact', channel: 'email', contact: '', error: null };
const verifyStep: LoginState = { step: 'verify', channel: 'email', contact: 'pat@example.test', error: null };

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  rateLimited.mockReset().mockResolvedValue(false);
  delete process.env.SMS_ENABLED;
});

describe('loginAction verify', () => {
  const verify = (next: string) => loginAction(verifyStep, form({ intent: 'verify', channel: 'email', contact: 'pat@example.test', code: '123 456', next }));

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
      channel: 'email',
      contact: 'pat@example.test',
      error: 'That code did not work. Check it, or go back and request a new one.',
    });
  });

  it('normalizes the email it verifies', async () => {
    await expect(loginAction(verifyStep, form({ intent: 'verify', contact: ' Pat@Example.TEST ', code: '123456', next: '/trips' }))).rejects.toThrow('REDIRECT:/trips');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'pat@example.test', token: '123456', type: 'email' });
  });

  it('stays on the verify step without a code, and falls back to the previous contact', async () => {
    const noCode = await loginAction(verifyStep, form({ intent: 'verify', contact: 'pat@example.test', code: 'abc' }));
    expect(noCode).toEqual({ step: 'verify', channel: 'email', contact: 'pat@example.test', error: 'Enter the code we sent you.' });
    const badContact = await loginAction(verifyStep, form({ intent: 'verify', contact: 'not-an-email', code: '123456' })).catch((e) => e);
    expect(verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'pat@example.test' }));
    expect(badContact).toBeInstanceOf(Error);
    verifyOtp.mockClear();
    const none = await loginAction(contactStep, form({ intent: 'verify', code: '123456' }));
    expect(none.step).toBe('verify');
    expect(none.error).toBe('Enter the code we sent you.');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies a text-message code once SMS is on', async () => {
    process.env.SMS_ENABLED = 'true';
    const phoneStep: LoginState = { step: 'verify', channel: 'phone', contact: '+15551234567', error: null };
    await expect(loginAction(phoneStep, form({ intent: 'verify', channel: 'phone', contact: '+15551234567', code: '123456', next: '/trips/abc' }))).rejects.toThrow(
      'REDIRECT:/trips/abc',
    );
    expect(verifyOtp).toHaveBeenCalledWith({ phone: '+15551234567', token: '123456', type: 'sms' });
  });
});

describe('loginAction send', () => {
  it('moves to verify on success and normalizes the email', async () => {
    const result = await loginAction(contactStep, form({ intent: 'send', channel: 'email', contact: ' Pat@Example.TEST ' }));
    expect(result).toEqual({ step: 'verify', channel: 'email', contact: 'pat@example.test', error: null });
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'pat@example.test', options: { shouldCreateUser: true } });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('stays on the contact step with an error when sending fails', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'rate limit' } });
    const result = await loginAction(contactStep, form({ intent: 'send', contact: 'pat@example.test' }));
    expect(result).toEqual({ step: 'contact', channel: 'email', contact: 'pat@example.test', error: 'We could not send a code just now. Try again in a minute.' });
  });

  it('rejects an invalid email without calling Supabase', async () => {
    const result = await loginAction(contactStep, form({ intent: 'send', contact: 'pat@' }));
    expect(result).toEqual({ step: 'contact', channel: 'email', contact: '', error: 'Enter a valid email address.' });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('treats a missing intent as send', async () => {
    await loginAction(contactStep, form({ contact: 'pat@example.test' }));
    expect(signInWithOtp).toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('ignores a phone request while SMS is off, and sends by text once it is on', async () => {
    const off = await loginAction(contactStep, form({ intent: 'send', channel: 'phone', contact: '(555) 123-4567' }));
    expect(off).toEqual({ step: 'contact', channel: 'email', contact: '', error: 'Enter a valid email address.' });
    process.env.SMS_ENABLED = 'true';
    const on = await loginAction(contactStep, form({ intent: 'send', channel: 'phone', contact: '(555) 123-4567' }));
    expect(on).toEqual({ step: 'verify', channel: 'phone', contact: '+15551234567', error: null });
    expect(signInWithOtp).toHaveBeenCalledWith({ phone: '+15551234567', options: { shouldCreateUser: true } });
  });

  it('sends no code while the visitor is over the code-send limit', async () => {
    rateLimited.mockResolvedValue(true);
    const result = await loginAction(contactStep, form({ intent: 'send', contact: 'pat@example.test' }));
    expect(result).toEqual({ step: 'contact', channel: 'email', contact: 'pat@example.test', error: 'Too many codes requested. Wait a minute, then try again.' });
    expect(rateLimited).toHaveBeenCalledWith('auth-code-send');
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
