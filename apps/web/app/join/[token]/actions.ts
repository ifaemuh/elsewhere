'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { smsEnabled } from '@/lib/auth/phone';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { normalizeTimeZone } from '@/lib/time-zone';
import { isJoinTokenShape } from '@/lib/trips/join-token';

export interface JoinState {
  error: string | null;
}

const JoinInput = z.object({
  displayName: z.string().trim().min(1, 'Add your name.').max(80),
  venmo: z.string().trim().regex(/^@?[A-Za-z0-9_-]{5,30}$/, 'That Venmo username looks off.').optional().or(z.literal('')),
  cashtag: z.string().trim().regex(/^\$?[A-Za-z][A-Za-z0-9]{0,19}$/, 'That $cashtag looks off.').optional().or(z.literal('')),
  smsOptIn: z.boolean(),
  timezone: z.string().max(64),
});

// Not exported: a 'use server' file may export only async functions.
const SMS_POLICY_VERSION = 'sms-2026-10';
const EMAIL_POLICY_VERSION = 'email-2026-10';

export async function joinTripAction(token: string, _prev: JoinState, form: FormData): Promise<JoinState> {
  if (!isJoinTokenShape(token)) return { error: 'This invite link is not valid.' };
  const user = await requireUser(`/join/${token}`);
  const parsed = JoinInput.safeParse({
    displayName: form.get('displayName') ?? '',
    venmo: form.get('venmo') ?? '',
    cashtag: form.get('cashtag') ?? '',
    smsOptIn: form.get('smsOptIn') === 'on',
    timezone: form.get('timezone') ?? 'America/New_York',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  // join_trip takes the raw token and hashes it itself, so the stored hash is never a usable credential.
  const { data: tripId, error } = await supabase.rpc('join_trip', { p_token: token, p_display_name: parsed.data.displayName });
  if (error || typeof tripId !== 'string') return { error: 'This invite link has expired. Ask the planner for a new one.' };

  const smsOptIn = parsed.data.smsOptIn && smsEnabled() && Boolean(user.phone);
  // Write only what the person filled in: joining a second trip must not wipe saved handles or an earlier SMS opt-in.
  const profileUpdate: Record<string, string | boolean> = {};
  if (parsed.data.venmo) profileUpdate.venmo_username = parsed.data.venmo.replace(/^@/, '');
  if (parsed.data.cashtag) profileUpdate.cashtag = parsed.data.cashtag.replace(/^\$/, '');
  if (smsOptIn) profileUpdate.sms_opt_in = true;
  const timezone = normalizeTimeZone(parsed.data.timezone);
  if (timezone) profileUpdate.timezone = timezone;
  if (Object.keys(profileUpdate).length > 0) {
    const { error: profileError } = await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
    if (profileError) console.error('join: profile update failed', profileError.message);
  }

  const consents = [
    ...(user.email ? [{ user_id: user.id, kind: 'email', policy_version: EMAIL_POLICY_VERSION }] : []),
    ...(smsOptIn ? [{ user_id: user.id, kind: 'sms', policy_version: SMS_POLICY_VERSION }] : []),
  ];
  if (consents.length > 0) {
    const { error: consentError } = await supabase.from('consents').insert(consents);
    if (consentError) console.error('join: consent insert failed', consentError.message);
  }

  redirect(`/trips/${tripId}`);
}
