import 'server-only';
import { smsEnabled } from '@/lib/auth/phone';
import { createAdminClient } from '@/lib/supabase/admin';
import { deliver } from './deliver';
import { planDeliveries, type NotifyInput, type Recipient } from './plan';

export async function queueNotifications(input: NotifyInput, now: Date = new Date()): Promise<void> {
  if (input.userIds.length === 0) return;
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, phone, sms_opt_in, timezone')
    .in('id', input.userIds);
  if (error) throw new Error(error.message);
  // sms_opt_in is user-writable; only an unrevoked SMS consent row authorizes texting.
  const { data: consents, error: consentError } = await admin
    .from('consents')
    .select('user_id')
    .in('user_id', input.userIds)
    .eq('kind', 'sms')
    .is('revoked_at', null);
  if (consentError) throw new Error(consentError.message);
  const consented = new Set((consents ?? []).map((c: { user_id: string }) => c.user_id));
  const recipients: Recipient[] = (profiles ?? []).map((p: Omit<Recipient, 'sms_consent'>) => ({ ...p, sms_consent: consented.has(p.id) }));
  const rows = planDeliveries(recipients, input, now, smsEnabled());
  if (rows.length > 0) {
    const { error: insertError } = await admin.from('notifications').insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
  await flushDue(now);
}

/** Sends every queued notification that is due, oldest first, 50 a call. A failed send is marked failed, not retried. */
export async function flushDue(now: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const { data: due, error } = await admin
    .from('notifications')
    .select('id, channel, subject, body, profiles!inner(email, phone, sms_opt_in)')
    .eq('status', 'queued')
    .lte('send_after', now.toISOString())
    .order('created_at')
    .limit(50);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const row of due ?? []) {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { email: string | null; phone: string | null; sms_opt_in: boolean };
    // A STOP can arrive between queueing and sending; re-check before texting.
    const to = row.channel === 'email' ? profile.email : profile.sms_opt_in ? profile.phone : null;
    if (!to) {
      await admin.from('notifications').update({ status: 'skipped' }).eq('id', row.id);
      continue;
    }
    try {
      const { providerMessageId } = await deliver({ channel: row.channel, to, subject: row.subject, body: row.body });
      await admin.from('notifications').update({ status: 'sent', provider_message_id: providerMessageId }).eq('id', row.id);
      sent += 1;
    } catch (deliveryError) {
      console.error('notification failed', row.id, deliveryError instanceof Error ? deliveryError.message : 'unknown error');
      await admin.from('notifications').update({ status: 'failed' }).eq('id', row.id);
    }
  }
  return sent;
}
