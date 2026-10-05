import { isCronRequest } from '@/lib/cron-auth';
import { runDocumentChecks } from '@/lib/documents/service';
import { createAdminClient } from '@/lib/supabase/admin';

/** The spec's T-30 check: daily, re-check every member of each trip that starts 30 days from today (UTC). */
export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response('unauthorized', { status: 401 });
  const day = new Date(Date.now() + 30 * 24 * 3600_000).toISOString().slice(0, 10);
  const { data: trips, error } = await createAdminClient().from('trips').select('id').eq('start_date', day);
  if (error) throw new Error(error.message);
  // One trip failing must not leave the rest of the day's trips unchecked.
  const failed: string[] = [];
  for (const trip of trips ?? []) {
    try {
      await runDocumentChecks(trip.id);
    } catch (e) {
      console.error('T-30 document check failed', trip.id, e instanceof Error ? e.message : 'unknown');
      failed.push(trip.id);
    }
  }
  if (failed.length > 0) return Response.json({ day, checked: (trips ?? []).length - failed.length, failed }, { status: 500 });
  return Response.json({ day, checked: (trips ?? []).length });
}
