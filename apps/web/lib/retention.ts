const DAY = 24 * 60 * 60 * 1000;

export interface RetentionInput {
  now: Date;
  trips: { id: string; end_date: string | null }[];
  members: { trip_id: string; user_id: string }[];
  documents: { user_id: string; keep_on_profile: boolean }[];
  inbound: { id: string; storage_path: string | null; received_at: string }[];
}

export interface RetentionPlan {
  deleteDocumentsFor: string[];
  purgeInbound: { id: string; storage_path: string }[];
  deleteBookingsForTrips: string[];
}

export function retentionPlan(input: RetentionInput): RetentionPlan {
  const ends = new Map(input.trips.map((trip) => [trip.id, trip.end_date ? new Date(`${trip.end_date}T23:59:59Z`).getTime() : Number.POSITIVE_INFINITY]));
  const lastTripEnd = new Map<string, number>();
  for (const member of input.members) {
    lastTripEnd.set(member.user_id, Math.max(lastTripEnd.get(member.user_id) ?? 0, ends.get(member.trip_id) ?? Number.POSITIVE_INFINITY));
  }
  const documentCutoff = input.now.getTime() - 30 * DAY;
  const deleteDocumentsFor = [
    ...new Set(
      input.documents
        .filter((doc) => !doc.keep_on_profile && (lastTripEnd.get(doc.user_id) ?? Number.POSITIVE_INFINITY) < documentCutoff)
        .map((doc) => doc.user_id),
    ),
  ].sort();
  const purgeInbound = input.inbound
    .filter((m): m is { id: string; storage_path: string; received_at: string } => m.storage_path !== null && new Date(m.received_at).getTime() < documentCutoff)
    .map(({ id, storage_path }) => ({ id, storage_path }));
  const bookingCutoff = input.now.getTime() - 365 * DAY;
  const deleteBookingsForTrips = input.trips.filter((trip) => (ends.get(trip.id) ?? Number.POSITIVE_INFINITY) < bookingCutoff).map((trip) => trip.id);
  return { deleteDocumentsFor, purgeInbound, deleteBookingsForTrips };
}

/**
 * A forwarded email lives in `<trip>/<message>/` as email.json plus its attachments, so the whole folder goes.
 * A screenshot is a single file in `<trip>/screenshots/`, a folder it shares with the trip's other screenshots.
 */
export async function inboundObjects(
  admin: { storage: { from(bucket: string): { list(prefix: string, options?: { limit: number }): Promise<{ data: { name: string }[] | null; error?: { message: string } | null }> } } },
  storagePath: string,
): Promise<string[]> {
  if (!storagePath.endsWith('/email.json')) return [storagePath];
  const prefix = storagePath.slice(0, -'/email.json'.length);
  // Storage lists 100 objects by default; a mail with attachments must not leave any behind.
  const { data: objects, error } = await admin.storage.from('inbound').list(prefix, { limit: 1000 });
  // A failed listing must not let the caller forget the path while attachments remain.
  if (error) throw new Error(`could not list ${prefix}: ${error.message}`);
  return [...new Set([storagePath, ...(objects ?? []).map((object) => `${prefix}/${object.name}`)])];
}

const PAGE = 1000;

/**
 * PostgREST returns at most 1,000 rows a request, so a plain select would silently drop the rest, and retention
 * would act on part of the data. This reads page after page until a short one. `page` must order its rows.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Applies the plan. Each part runs on its own: one that fails does not stop the others, and the failures are thrown
 * together at the end, so the cron reports them and the next day's run retries them.
 */
export async function runRetention(now: Date = new Date()): Promise<RetentionPlan> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { removeInbound } = await import('@/lib/intake/storage');
  const admin = createAdminClient();
  const [trips, members, documents, inbound] = await Promise.all([
    selectAll<{ id: string; end_date: string | null }>((from, to) => admin.from('trips').select('id, end_date').order('id').range(from, to)),
    selectAll<{ trip_id: string; user_id: string }>((from, to) => admin.from('trip_members').select('trip_id, user_id').order('id').range(from, to)),
    selectAll<{ user_id: string; keep_on_profile: boolean }>((from, to) => admin.from('member_documents').select('user_id, keep_on_profile').order('id').range(from, to)),
    selectAll<{ id: string; storage_path: string | null; received_at: string }>((from, to) =>
      admin.from('inbound_messages').select('id, storage_path, received_at').not('storage_path', 'is', null).order('id').range(from, to),
    ),
  ]);
  const plan = retentionPlan({ now, trips, members, documents, inbound });
  const failures: string[] = [];

  if (plan.deleteDocumentsFor.length > 0) {
    const { error } = await admin.from('member_documents').delete().in('user_id', plan.deleteDocumentsFor).eq('keep_on_profile', false);
    if (error) failures.push(`documents: ${error.message}`);
  }
  for (const message of plan.purgeInbound) {
    try {
      await removeInbound(await inboundObjects(admin, message.storage_path));
      // Forget the path only after the objects are gone, so a failure above is retried tomorrow.
      const { error } = await admin.from('inbound_messages').update({ storage_path: null }).eq('id', message.id);
      if (error) throw new Error(error.message);
    } catch (error) {
      failures.push(`inbound ${message.id}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
  if (plan.deleteBookingsForTrips.length > 0) {
    const { error } = await admin.from('bookings').delete().in('trip_id', plan.deleteBookingsForTrips);
    if (error) failures.push(`bookings: ${error.message}`);
  }
  if (failures.length > 0) throw new Error(`retention finished with ${failures.length} failure(s): ${failures.join('; ')}`);
  return plan;
}
