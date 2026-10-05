import { isCronRequest } from '@/lib/cron-auth';
import { runRetention } from '@/lib/retention';

export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response('unauthorized', { status: 401 });
  const plan = await runRetention();
  return Response.json({
    documentsDeleted: plan.documentsDeleted,
    inboundPurged: plan.purgeInbound.length,
    tripsWithBookingsDeleted: plan.deleteBookingsForTrips.length,
  });
}
