'use server';

import { redirect } from 'next/navigation';
import { parseEmail, parseOtpCode } from '@/lib/auth/otp';
import { parsePhone, smsEnabled } from '@/lib/auth/phone';
import { safeNext } from '@/lib/auth/safe-next';
import { RATE_LIMIT_RULES, rateLimited } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  step: 'contact' | 'verify';
  channel: 'email' | 'phone';
  contact: string;
  error: string | null;
}

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const supabase = await createClient();
  const channel = form.get('channel') === 'phone' && smsEnabled() ? 'phone' : 'email';
  const parseContact = (value: FormDataEntryValue | null) => (channel === 'phone' ? parsePhone(value) : parseEmail(value));

  if (form.get('intent') === 'verify') {
    // Normalized like the send step, falling back to the address the code went to (as in C1).
    const contact = parseContact(form.get('contact')) ?? prev.contact;
    const code = parseOtpCode(form.get('code'));
    if (!contact || !code) return { step: 'verify', channel, contact, error: 'Enter the code we sent you.' };
    const { error } =
      channel === 'phone'
        ? await supabase.auth.verifyOtp({ phone: contact, token: code, type: 'sms' })
        : await supabase.auth.verifyOtp({ email: contact, token: code, type: 'email' });
    if (error) return { step: 'verify', channel, contact, error: 'That code did not work. Check it, or go back and request a new one.' };
    redirect(safeNext(String(form.get('next') ?? '')));
  }

  const contact = parseContact(form.get('contact'));
  if (!contact) {
    return { step: 'contact', channel, contact: '', error: channel === 'phone' ? 'Enter a valid mobile number.' : 'Enter a valid email address.' };
  }
  // Every send costs an email or a text; an unthrottled form is an SMS-pumping target.
  if (await rateLimited(RATE_LIMIT_RULES.codeSend)) {
    return { step: 'contact', channel, contact, error: 'Too many codes requested. Wait a minute, then try again.' };
  }
  const { error } =
    channel === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: contact, options: { shouldCreateUser: true } })
      : await supabase.auth.signInWithOtp({ email: contact, options: { shouldCreateUser: true } });
  if (error) return { step: 'contact', channel, contact, error: 'We could not send a code just now. Try again in a minute.' };
  return { step: 'verify', channel, contact, error: null };
}
