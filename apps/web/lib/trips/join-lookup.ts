import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashJoinToken, isJoinTokenShape } from './join-token';

/** Service role, because the visitor is not a member yet. Selects only what joinPreview may reveal. */
// cache(): the page, its metadata, and the OG image each look the same token up in one request.
export const findJoinableTrip = cache(async (token: string) => {
  if (!isJoinTokenShape(token)) return null;
  const admin = createAdminClient();
  const { data: trip } = await admin
    .from('trips')
    .select('id, name, start_date, end_date')
    .eq('join_token_hash', hashJoinToken(token))
    .gt('join_token_expires_at', new Date().toISOString())
    .maybeSingle();
  if (!trip) return null;
  const { count } = await admin.from('trip_members').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id);
  return { trip, memberCount: count ?? 0 };
});
