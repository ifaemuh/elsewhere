import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Utm } from './utm';
import { PRICE_EXPERIMENT_KEY } from './variant';

export type FunnelEventName =
  | 'rule_page_view'
  | 'offer_click'
  | 'trip_started'
  | 'booking_forwarded'
  | 'checkout_started'
  | 'paid';

export interface FunnelEventInput {
  anonymousId: string;
  event: FunnelEventName;
  ruleId?: string | null;
  variant?: string | null;
  userId?: string | null;
  tripId?: string | null;
  utm?: Utm;
  metadata?: Record<string, unknown>;
}

export interface FunnelEventRow {
  anonymous_id: string;
  event_name: FunnelEventName;
  rule_id: string | null;
  variant: string | null;
  user_id: string | null;
  trip_id: string | null;
  metadata: Record<string, unknown>;
}

export function telemetryEnabled(): boolean {
  return process.env.ELSEWHERE_ENABLE_FUNNEL_TELEMETRY !== 'false';
}

export function toEventRow(input: FunnelEventInput): FunnelEventRow {
  return {
    anonymous_id: input.anonymousId,
    event_name: input.event,
    rule_id: input.ruleId ?? null,
    variant: input.variant ?? null,
    user_id: input.userId ?? null,
    trip_id: input.tripId ?? null,
    metadata: { ...(input.metadata ?? {}), ...(input.utm ?? {}) },
  };
}

/** Never throws: telemetry must not break a page or a checkout. */
export async function recordEvent(input: FunnelEventInput): Promise<void> {
  if (!telemetryEnabled()) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('funnel_telemetry_events').insert(toEventRow(input));
    if (error) console.error('funnel event failed', error.message);
    if (input.event === 'rule_page_view' && input.variant) {
      await admin
        .from('experiment_assignments')
        .upsert(
          { anonymous_id: input.anonymousId, flag_key: PRICE_EXPERIMENT_KEY, variant: input.variant, user_id: input.userId ?? null },
          { onConflict: 'anonymous_id,flag_key', ignoreDuplicates: true },
        );
    }
  } catch (error) {
    console.error('funnel event failed', error);
  }
}
