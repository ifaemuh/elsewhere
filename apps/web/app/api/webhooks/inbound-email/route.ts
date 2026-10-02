import { Resend } from 'resend';
import { start } from 'workflow/api';
import { requireEnv } from '@/lib/env';
import { parseSender, senderAllowed } from '@/lib/intake/sender';
import { createAdminClient } from '@/lib/supabase/admin';
import { inboundCodeFromAddress } from '@/lib/trips/inbound-code';
import { intakeWorkflow } from '@/workflows/intake';

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const header = (name: string) => request.headers.get(`svix-${name}`) ?? request.headers.get(`webhook-${name}`) ?? '';
  // Verify before any database access. A missing secret is our misconfiguration (500), never a reason to accept unsigned mail.
  let apiKey: string;
  let webhookSecret: string;
  try {
    apiKey = requireEnv('RESEND_API_KEY');
    webhookSecret = requireEnv('RESEND_WEBHOOK_SECRET');
  } catch {
    console.error('inbound email webhook is not configured');
    return new Response('webhook not configured', { status: 500 });
  }
  let event: ReturnType<Resend['webhooks']['verify']>;
  try {
    event = new Resend(apiKey).webhooks.verify({
      payload,
      headers: { id: header('id'), timestamp: header('timestamp'), signature: header('signature') },
      webhookSecret,
    });
  } catch {
    return new Response('invalid signature', { status: 401 });
  }
  if (event.type !== 'email.received') return Response.json({ ignored: event.type });

  const { data } = event;
  const inboundDomain = requireEnv('INBOUND_DOMAIN');
  const code = [...data.received_for, ...data.to].map((address) => inboundCodeFromAddress(address, inboundDomain)).find(Boolean);
  if (!code) return Response.json({ ignored: 'no trip address' });

  const admin = createAdminClient();
  const { data: trip } = await admin.from('trips').select('id, name').eq('inbound_code', code).maybeSingle();
  if (!trip) return Response.json({ ignored: 'unknown trip' });

  // Service role reads members' own emails. Only those may forward bookings in, which blocks casual booking
  // injection. This trusts the From header: Resend gives no SPF or DKIM verdict here, so a forged From naming
  // a member gets through. The forger also needs the trip's unguessable address, and intake only drafts
  // bookings: anything unclear waits for the planner, and nothing is booked, filed, or paid from it.
  const { data: rows } = await admin.from('trip_members').select('user_id, role, profiles!inner(email)').eq('trip_id', trip.id);
  const members = (rows ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { userId: row.user_id as string, role: row.role as 'planner' | 'member', email: (profile?.email ?? null) as string | null };
  });
  const sender = parseSender(data.from);
  const permitted = sender !== null && senderAllowed(sender, members.flatMap((m) => (m.email ? [m.email] : [])));

  const { data: inserted, error } = await admin
    .from('inbound_messages')
    .insert({ trip_id: trip.id, source: 'email', provider_message_id: data.email_id, sender, subject: data.subject, status: permitted ? 'received' : 'quarantined' })
    .select('id')
    .single();
  let messageId: string;
  if (error) {
    if (error.code !== '23505') return new Response('could not store message', { status: 500 });
    // provider_message_id is unique: Resend retried a delivery we already stored. A row still `received`
    // means intake never started (the last start threw, and we answered 500 so Resend would retry).
    const { data: existing } = await admin.from('inbound_messages').select('id, status').eq('provider_message_id', data.email_id).maybeSingle();
    if (existing?.status !== 'received') return Response.json({ duplicate: data.email_id });
    messageId = existing.id;
  } else {
    messageId = inserted.id;
    if (!permitted) {
      const planner = members.find((member) => member.role === 'planner');
      if (planner) {
        await admin.from('action_items').insert({
          trip_id: trip.id,
          kind: 'approval',
          title: 'Approve a forwarded email',
          detail: `${sender ?? 'An unknown sender'} forwarded “${data.subject}” to the trip. Approve it only if you know them.`,
          assigned_user_ids: [planner.userId],
          source_kind: 'inbound_quarantine',
          related_entity_id: messageId,
        });
      }
      return Response.json({ quarantined: messageId });
    }
  }

  try {
    await start(intakeWorkflow, [messageId]);
  } catch (startError) {
    console.error('intake did not start', messageId, startError);
    return new Response('could not start intake', { status: 500 });
  }
  return Response.json({ accepted: messageId });
}
