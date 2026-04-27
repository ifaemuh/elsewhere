import { NextRequest, NextResponse } from 'next/server';
import { isLocalDev } from '@lib/storage';
import { createAdminClient } from '@lib/supabase/admin';
import { syncTravelerPaymentStates } from '@lib/engines/wallet';

interface FinancingWebhookPayload {
  eventType: string; // payment_posted, payment_late, payment_pending
  installmentReference: string;
  occurredAt: string;
  providerEventKey: string;
}

export async function POST(req: NextRequest) {
  if (isLocalDev()) {
    return NextResponse.json({ status: 'skipped', message: 'Webhooks disabled in local dev' });
  }

  // Verify webhook secret
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.FINANCING_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid webhook secret', statusCode: 401 },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const payload = (await req.json()) as FinancingWebhookPayload;

  // Find the installment by reference key
  const { data: installment, error: findError } = await supabase
    .from('wallet_installments')
    .select('id, trip_id, status')
    .eq('reference_key', payload.installmentReference)
    .maybeSingle();

  if (findError || !installment) {
    return NextResponse.json(
      { error: 'Not Found', message: 'Installment not found', statusCode: 404 },
      { status: 404 },
    );
  }

  // Check for duplicate event
  const { data: existingEvent } = await supabase
    .from('financing_status_events')
    .select('id')
    .eq('installment_id', installment.id)
    .eq('event_type', payload.eventType)
    .eq('occurred_at', payload.occurredAt)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({ status: 'duplicate', eventId: existingEvent.id });
  }

  // Record the event
  const { data: event, error: eventError } = await supabase
    .from('financing_status_events')
    .insert({
      installment_id: installment.id,
      event_type: payload.eventType,
      occurred_at: payload.occurredAt,
    })
    .select('id')
    .single();

  if (eventError) {
    return NextResponse.json(
      { error: 'Failed to record event', message: eventError.message, statusCode: 500 },
      { status: 500 },
    );
  }

  // Update installment status based on event
  const newStatus =
    payload.eventType === 'payment_posted' ? 'paid' :
    payload.eventType === 'payment_late' ? 'late' : 'pending';

  await supabase
    .from('wallet_installments')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', installment.id);

  // Sync traveler payment states
  await syncTravelerPaymentStates(supabase, installment.trip_id);

  return NextResponse.json({ status: 'processed', eventId: event!.id });
}
