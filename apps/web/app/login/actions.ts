'use server';

import { redirect } from 'next/navigation';
import { parseEmail, parseOtpCode } from '@/lib/auth/otp';
import { safeNext } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  step: 'email' | 'verify';
  email: string;
  error: string | null;
}

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const supabase = await createClient();
  if (form.get('intent') === 'verify') {
    const email = parseEmail(form.get('email')) ?? prev.email;
    const code = parseOtpCode(form.get('code'));
    if (!email || !code) return { step: 'verify', email, error: 'Enter the code from the email.' };
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) return { step: 'verify', email, error: 'That code did not work. Check it, or go back and request a new one.' };
    redirect(safeNext(String(form.get('next') ?? '')));
  }
  const email = parseEmail(form.get('email'));
  if (!email) return { step: 'email', email: '', error: 'Enter a valid email address.' };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { step: 'email', email, error: 'We could not send a code just now. Try again in a minute.' };
  return { step: 'verify', email, error: null };
}
