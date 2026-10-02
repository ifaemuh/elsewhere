import 'server-only';
import { recordEvent } from '@/lib/funnel/events';
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
    async activateTrip(tripId, passStatus) {
      check(await admin.from('trips').update({ pass_status: passStatus }).eq('id', tripId));
    },
    async recordPaid({ anonymousId, tripId, variant, amountCents, utm }) {
      await recordEvent({ anonymousId, event: 'paid', tripId, variant, utm, metadata: { amount_cents: amountCents } });
    },
  };
}
