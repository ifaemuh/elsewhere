import 'server-only';
import { telemetryEnabled, toEventRow } from '@/lib/funnel/events';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PassStore } from './passes';

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function supabasePassStore(): PassStore {
  const admin = createAdminClient();
  return {
    async alreadyProcessed(eventId) {
      const row = check(await admin.from('webhook_events').select('event_id').eq('provider', 'stripe').eq('event_id', eventId).maybeSingle());
      return row !== null;
    },
    async markProcessed(eventId) {
      check(await admin.from('webhook_events').upsert({ provider: 'stripe', event_id: eventId }, { onConflict: 'provider,event_id', ignoreDuplicates: true }));
    },
    async completePass({ sessionId, tripId, status, amountCents, paidAt }) {
      const pass = check(
        await admin
          .from('passes')
          .update({ status, amount_cents: amountCents, paid_at: paidAt })
          .eq('stripe_session_id', sessionId)
          .eq('trip_id', tripId)
          .select('anonymous_id, price_variant')
          .maybeSingle(),
      );
      if (!pass) return null;
      const trip = check(await admin.from('trips').select('created_utm').eq('id', tripId).maybeSingle());
      return { anonymousId: pass.anonymous_id, variant: pass.price_variant, utm: (trip?.created_utm ?? {}) as Record<string, string> };
    },
    async hasOtherActivePass(tripId, sessionId) {
      const rows = check(
        await admin.from('passes').select('id').eq('trip_id', tripId).in('status', ['paid', 'comp']).neq('stripe_session_id', sessionId).limit(1),
      );
      return (rows?.length ?? 0) > 0;
    },
    async activateTrip(tripId, passStatus) {
      check(await admin.from('trips').update({ pass_status: passStatus }).eq('id', tripId));
    },
    async recordPaid({ anonymousId, tripId, variant, amountCents, utm }) {
      if (!telemetryEnabled()) return;
      const { error } = await admin
        .from('funnel_telemetry_events')
        .insert(toEventRow({ anonymousId, event: 'paid', tripId, variant, utm, metadata: { amount_cents: amountCents } }));
      // 23505 is funnel_paid_trip_idx: this trip's paid event already exists, so a retry is a no-op.
      if (error && error.code !== '23505') throw new Error(error.message);
    },
  };
}
