'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { recordEvent } from '@/lib/funnel/events';
import { parseUtmCookie, UTM_COOKIE } from '@/lib/funnel/utm';
import { RATE_LIMIT_RULES, rateLimited } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { newInboundCode } from '@/lib/trips/inbound-code';
import { parseNewTrip } from '@/lib/trips/new-trip';
import { tripsOpen } from '@/lib/trips/open';

export interface NewTripState {
  error: string | null;
}

export async function createTrip(_prev: NewTripState, form: FormData): Promise<NewTripState> {
  if (!tripsOpen()) redirect('/start');
  const user = await requireUser('/trips/new');
  const parsed = parseNewTrip(form);
  if (!parsed.success) return { error: parsed.error };
  if (await rateLimited(RATE_LIMIT_RULES.tripCreate, user.id)) return { error: 'Too many new trips from here. Wait a minute, then try again.' };

  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  const utm = parseUtmCookie(store.get(UTM_COOKIE)?.value);
  const supabase = await createClient();
  // create_trip is security definer: it sets owner_id and pass_status itself, which the caller cannot write.
  const { data: tripId, error } = await supabase.rpc('create_trip', {
    p_name: parsed.data.name,
    p_destination_country: parsed.data.destinationCountry,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_inbound_code: newInboundCode(),
    p_display_name: parsed.data.displayName,
    p_anonymous_id: isAnonymousId(anonymousId) ? anonymousId : null,
    p_utm: utm,
  });
  if (error || typeof tripId !== 'string') return { error: 'We could not create the trip. Try again.' };

  if (isAnonymousId(anonymousId)) {
    await recordEvent({ anonymousId, event: 'trip_started', userId: user.id, tripId, utm });
  }
  redirect(`/trips/${tripId}`);
}
