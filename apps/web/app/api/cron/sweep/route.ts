import { sweepStuckWork } from '@/lib/admin/sweep';
import { isCronRequest } from '@/lib/cron-auth';

/** Daily: starts incident and intake runs that never started. The same work is listed on /admin with a Start button. */
export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response('unauthorized', { status: 401 });
  const result = await sweepStuckWork();
  const failed = result.incidents.failed.length + result.messages.failed.length;
  return Response.json(result, { status: failed > 0 ? 500 : 200 });
}
