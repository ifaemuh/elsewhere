const DAY = 24 * 60 * 60 * 1000;

export interface RetentionInput {
  now: Date;
  trips: { id: string; start_date: string | null; end_date: string | null }[];
  inbound: { id: string; storage_path: string | null; received_at: string }[];
}

export interface RetentionPlan {
  purgeInbound: { id: string; storage_path: string }[];
  deleteBookingsForTrips: string[];
}

/**
 * Raw inbound files and bookings. Documents are not planned here: `purge_member_documents` decides and deletes in one
 * statement, because the rule needs each member's every trip and a read-then-delete would act on a stale snapshot.
 */
export function retentionPlan(input: RetentionInput): RetentionPlan {
  const purgeCutoff = input.now.getTime() - 30 * DAY;
  const purgeInbound = input.inbound
    .filter((m): m is { id: string; storage_path: string; received_at: string } => m.storage_path !== null && new Date(m.received_at).getTime() < purgeCutoff)
    .map(({ id, storage_path }) => ({ id, storage_path }));
  // A year after the trip, by the calendar. A trip with no dates is never purged.
  const deleteBookingsForTrips = input.trips
    .filter((trip) => {
      const last = trip.end_date ?? trip.start_date;
      if (!last) return false;
      const purgeAfter = new Date(`${last}T23:59:59Z`);
      purgeAfter.setUTCFullYear(purgeAfter.getUTCFullYear() + 1);
      return purgeAfter.getTime() < input.now.getTime();
    })
    .map((trip) => trip.id);
  return { purgeInbound, deleteBookingsForTrips };
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

const BATCH = 100;

/**
 * Applies the plan. Each part runs on its own: one that fails does not stop the others, and the failures are thrown
 * together at the end, so the cron reports them and the next day's run retries them.
 */
export async function runRetention(now: Date = new Date()): Promise<RetentionPlan & { documentsDeleted: number }> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { removeInbound } = await import('@/lib/intake/storage');
  const admin = createAdminClient();
  const [trips, inbound] = await Promise.all([
    selectAll<{ id: string; start_date: string | null; end_date: string | null }>((from, to) => admin.from('trips').select('id, start_date, end_date').order('id').range(from, to)),
    selectAll<{ id: string; storage_path: string | null; received_at: string }>((from, to) =>
      admin.from('inbound_messages').select('id, storage_path, received_at').not('storage_path', 'is', null).order('id').range(from, to),
    ),
  ]);
  const plan = retentionPlan({ now, trips, inbound });
  const failures: string[] = [];

  let documentsDeleted = 0;
  const purged = await admin.rpc('purge_member_documents', { p_now: now.toISOString() });
  if (purged.error) failures.push(`documents: ${purged.error.message}`);
  else documentsDeleted = Number(purged.data ?? 0);

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
  for (let i = 0; i < plan.deleteBookingsForTrips.length; i += BATCH) {
    const { error } = await admin.from('bookings').delete().in('trip_id', plan.deleteBookingsForTrips.slice(i, i + BATCH));
    if (error) failures.push(`bookings: ${error.message}`);
  }
  if (failures.length > 0) throw new Error(`retention finished with ${failures.length} failure(s): ${failures.join('; ')}`);
  return { ...plan, documentsDeleted };
}
