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

const BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/** 429, 5xx, 408 and errors with no HTTP status (network) are transient; any other 4xx is permanent. */
export function isTransientError(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown } | null;
  const code = typeof e?.status === 'number' ? e.status : typeof e?.statusCode === 'number' ? e.statusCode : null;
  if (code === null) return true;
  return code === 408 || code === 429 || code >= 500;
}

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/**
 * Claims due notifications atomically (claim_due_notifications), then sends only what it claimed, 50 a call.
 * Transient failures go back to queued with backoff (5 min, 30 min, 2 h; three retries), permanent ones are failed.
 */
export async function flushDue(now: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const { data: claimed, error } = await admin.rpc('claim_due_notifications', { p_now: now.toISOString(), p_limit: 50 });
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const row of (claimed ?? []) as ClaimedRow[]) {
    // A STOP can arrive between queueing and sending; re-check before texting.
    const to = row.channel === 'email' ? row.email : row.sms_opt_in ? row.phone : null;
    if (!to) {
      check(await admin.from('notifications').update({ status: 'skipped' }).eq('id', row.id));
      continue;
    }
    try {
      const { providerMessageId } = await deliver({ channel: row.channel, to, subject: row.subject, body: row.body });
      check(await admin.from('notifications').update({ status: 'sent', provider_message_id: providerMessageId, attempts: row.attempts + 1 }).eq('id', row.id));
      sent += 1;
    } catch (deliveryError) {
      console.error('notification failed', row.id, deliveryError instanceof Error ? deliveryError.message : 'unknown error');
      const attempts = row.attempts + 1;
      const retry = isTransientError(deliveryError) && attempts <= BACKOFF_MS.length;
      const values = retry
        ? { status: 'queued', attempts, claimed_at: null, send_after: new Date(now.getTime() + BACKOFF_MS[attempts - 1]).toISOString() }
        : { status: 'failed', attempts };
      check(await admin.from('notifications').update(values).eq('id', row.id));
    }
  }
  return sent;
}

interface ClaimedRow {
  id: string;
  channel: 'email' | 'sms';
  subject: string | null;
  body: string;
  attempts: number;
  email: string | null;
  phone: string | null;
  sms_opt_in: boolean;
}
