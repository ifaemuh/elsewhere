import twilio from 'twilio';
import { appUrl } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUS_MAP: Record<string, string> = { delivered: 'delivered', sent: 'sent', failed: 'failed', undelivered: 'failed' };
// Status callbacks arrive out of order and repeat; a row only moves forward, and never out of delivered.
const ALLOWED_FROM: Record<string, string[]> = {
  sent: ['queued', 'sending'],
  delivered: ['queued', 'sending', 'sent'],
  failed: ['sending', 'sent'],
};
// Twilio's standard opt-out keywords. OptOutType is authoritative when present; the body is a fallback.
const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const params = Object.fromEntries(new URLSearchParams(body));
  const url = `${appUrl()}/api/webhooks/twilio`;
  const signature = request.headers.get('x-twilio-signature') ?? '';
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !twilio.validateRequest(token, signature, url, params)) {
    return new Response('invalid signature', { status: 403 });
  }
  const admin = createAdminClient();

  if (params.MessageSid && params.MessageStatus && STATUS_MAP[params.MessageStatus]) {
    const next = STATUS_MAP[params.MessageStatus];
    const { error } = await admin
      .from('notifications')
      .update({ status: next })
      .eq('provider_message_id', params.MessageSid)
      .in('status', ALLOWED_FROM[next]);
    if (error) return new Response('status update failed', { status: 500 });
  }

  // Twilio Advanced Opt-Out handles the STOP reply itself; we mirror the opt-out so we never queue SMS again.
  const optedOut = params.OptOutType === 'STOP' || STOP_KEYWORDS.has((params.Body ?? '').trim().toUpperCase());
  if (optedOut && params.From) {
    const { data: profile } = await admin.from('profiles').select('id').eq('phone', params.From).maybeSingle();
    if (profile) {
      // A 500 makes Twilio retry the STOP, so a failed write never leaves someone opted in.
      const optIn = await admin.from('profiles').update({ sms_opt_in: false }).eq('id', profile.id);
      const consent = await admin
        .from('consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('kind', 'sms')
        .is('revoked_at', null);
      if (optIn.error || consent.error) return new Response('opt-out failed', { status: 500 });
    }
  }
  return new Response('<Response/>', { headers: { 'content-type': 'text/xml' } });
}
